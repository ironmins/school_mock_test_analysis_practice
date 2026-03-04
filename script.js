/**
 * 고등학교 모의고사 성적분석 V14
 * script.js — 영역별 선택과목 분석 반영
 */

Chart.register(ChartDataLabels);
Chart.defaults.plugins.datalabels.display = false;

const state = {
    gradeData: {},
    availableGrades: [],
    currentGradeTotal: null,
    currentGradeClass: null,
    currentGradeIndiv: null,
    metric: 'raw',
    classMetric: 'raw',
    classSort: 'no',
    charts: {},
    subjectCharts: []
};

Object.defineProperty(state, 'exams', {
    get() {
        const g = state.currentGradeIndiv || state.availableGrades[0];
        return state.gradeData[g] || [];
    }
});

/* ── 탐구 선택과목 분류 ── */
const socialSubjects = [
    '생활과 윤리', '윤리와 사상', '한국 지리', '세계 지리',
    '동아시아사', '세계사', '정치와 법', '사회·문화', '사회문화',
    '통합사회', '사회'
];
const scienceSubjects = [
    '물리학Ⅰ', '물리학Ⅱ', '물리학1', '물리학2',
    '화학Ⅰ', '화학Ⅱ', '화학1', '화학2',
    '생명 과학Ⅰ', '생명 과학Ⅱ', '생명과학Ⅰ', '생명과학Ⅱ',
    '생명 과학1', '생명 과학2', '생명과학1', '생명과학2',
    '지구 과학Ⅰ', '지구 과학Ⅱ', '지구과학Ⅰ', '지구과학Ⅱ',
    '지구 과학1', '지구 과학2', '지구과학1', '지구과학2',
    '통합과학', '과학'
];

function classifyInquiry(name) {
    if (!name) return 'unknown';
    const n = name.trim();
    if (socialSubjects.some(s => n.includes(s) || s.includes(n))) return 'social';
    if (scienceSubjects.some(s => n.includes(s) || s.includes(n))) return 'science';
    return 'unknown';
}

/* ── 영역 정의 (6개 영역) ── */
const areas = [
    { k: 'kor',  n: '국어 영역',  hasChoice: true  },
    { k: 'math', n: '수학 영역',  hasChoice: true  },
    { k: 'eng',  n: '영어 영역',  hasChoice: false },
    { k: 'hist', n: '한국사',     hasChoice: false },
    { k: 'inq1', n: '탐구영역1',  hasChoice: true  },
    { k: 'inq2', n: '탐구영역2',  hasChoice: true  },
];

const radarPointColors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6'];

document.addEventListener('DOMContentLoaded', initializeEventListeners);

function initializeEventListeners() {
    const fileInput = document.getElementById('fileInput');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const uploadSection = document.querySelector('.upload-section');
    const fileLabel = document.querySelector('.file-input-label');

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            if (files.length > 0) {
                displayFileList(files);
                if (analyzeBtn) analyzeBtn.disabled = false;
            }
        });
    }

    if (analyzeBtn) analyzeBtn.addEventListener('click', analyzeFiles);

    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            switchTab(e.target.closest('.tab-btn').dataset.tab);
        });
    });

    if (uploadSection) {
        const prevent = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
        const setDragState = (on) => { if (fileLabel) fileLabel.classList.toggle('dragover', on); };
        ['dragover', 'drop'].forEach(evt => window.addEventListener(evt, prevent));
        ['dragenter', 'dragover'].forEach(evt => uploadSection.addEventListener(evt, (ev) => { prevent(ev); setDragState(true); }));
        ['dragleave', 'dragend'].forEach(evt => uploadSection.addEventListener(evt, (ev) => { prevent(ev); setDragState(false); }));
        uploadSection.addEventListener('drop', (ev) => {
            prevent(ev); setDragState(false);
            const dropped = Array.from(ev.dataTransfer?.files || []);
            const files = dropped.filter(f => /\.(xlsx|xls|csv|xlsm)$/i.test(f.name));
            if (files.length > 0) {
                displayFileList(files);
                if (analyzeBtn) analyzeBtn.disabled = false;
                const dt = new DataTransfer();
                files.forEach(f => dt.items.add(f));
                if (fileInput) fileInput.files = dt.files;
            }
        });
    }

    document.getElementById('gradeSelectTotal')?.addEventListener('change', onGradeChangeTotal);
    document.getElementById('gradeSelectClass')?.addEventListener('change', onGradeChangeClass);
    document.getElementById('gradeSelectIndiv')?.addEventListener('change', onGradeChangeIndiv);
    document.getElementById('examSelectTotal')?.addEventListener('change', renderOverall);
    document.getElementById('examSelectClass')?.addEventListener('change', renderClass);
    document.getElementById('classSelect')?.addEventListener('change', renderClass);
    document.getElementById('indivClassSelect')?.addEventListener('change', updateIndivList);
    document.getElementById('indivStudentSelect')?.addEventListener('change', renderIndividual);
    document.getElementById('indivExamSelect')?.addEventListener('change', renderIndividual);
    document.getElementById('pdfStudentBtn')?.addEventListener('click', generateStudentPDF);
    document.getElementById('pdfClassBtn')?.addEventListener('click', generateClassPDF);

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            state.subjectCharts.forEach(chart => {
                if (chart && !chart.destroyed && typeof chart.resize === 'function') chart.resize();
            });
        }, 150);
    });

    const saveHtmlBtn = document.getElementById('saveHtmlBtn');
    if (saveHtmlBtn) {
        saveHtmlBtn.replaceWith(saveHtmlBtn.cloneNode(true));
        document.getElementById('saveHtmlBtn').addEventListener('click', saveHtmlFile);
    }
}

/* ── 헬퍼 함수들 ── */
function getExamsForGrade(grade) { return state.gradeData[grade] || []; }

function onGradeChangeTotal() {
    const grade = parseInt(document.getElementById('gradeSelectTotal').value);
    state.currentGradeTotal = grade;
    updateExamSelector('examSelectTotal', grade);
    renderOverall();
}
function onGradeChangeClass() {
    const grade = parseInt(document.getElementById('gradeSelectClass').value);
    state.currentGradeClass = grade;
    updateExamSelector('examSelectClass', grade);
    updateClassSelector('classSelect', grade);
    renderClass();
}
function onGradeChangeIndiv() {
    const grade = parseInt(document.getElementById('gradeSelectIndiv').value);
    state.currentGradeIndiv = grade;
    updateExamSelector('indivExamSelect', grade);
    updateClassSelector('indivClassSelect', grade);
    updateIndivList();
}
function updateExamSelector(selectId, grade) {
    const el = document.getElementById(selectId);
    if (!el) return;
    const exams = getExamsForGrade(grade);
    el.innerHTML = exams.map((e, i) => `<option value="${i}">${e.name}</option>`).join('');
}
function updateClassSelector(selectId, grade) {
    const el = document.getElementById(selectId);
    if (!el) return;
    const exams = getExamsForGrade(grade);
    if (!exams.length) { el.innerHTML = ''; return; }
    const classSet = new Set();
    exams.forEach(exam => exam.students.forEach(s => classSet.add(s.info.class)));
    const classes = [...classSet].sort((a, b) => a - b);
    el.innerHTML = classes.map(c => `<option value="${c}">${c}반</option>`).join('');
    el.value = classes[0];
}
function updateGradeSelectors() {
    const grades = state.availableGrades;
    const opts = grades.map(g => `<option value="${g}">${g}학년</option>`).join('');
    ['gradeSelectTotal', 'gradeSelectClass', 'gradeSelectIndiv'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = opts;
    });
    state.currentGradeTotal = grades[0];
    state.currentGradeClass = grades[0];
    state.currentGradeIndiv = grades[0];
}

function displayFileList(files) {
    const fileList = document.getElementById('fileList');
    if (!fileList) return;
    fileList.innerHTML = '<h4><i class="fas fa-file-alt"></i> 선택된 파일:</h4>';
    const ul = document.createElement('ul');
    files.forEach(file => { const li = document.createElement('li'); li.textContent = file.name; ul.appendChild(li); });
    fileList.appendChild(ul);
    fileList.style.display = 'block';
}

function showLoading(text = '분석 중...') {
    const loadingText = document.getElementById('loadingText');
    if (loadingText) loadingText.textContent = text;
    document.getElementById('loading').style.display = 'flex';
}
function hideLoading() { document.getElementById('loading').style.display = 'none'; }

/* ── 파일 분석 ── */
async function analyzeFiles() {
    const fileInput = document.getElementById('fileInput');
    const files = Array.from(fileInput.files);
    if (files.length === 0) return alert('파일을 선택해주세요.');

    showLoading();
    try {
        const promises = files.map(file => new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const wb = XLSX.read(evt.target.result, { type: 'array' });
                    let targetSheetName = wb.SheetNames.find(name => {
                        const json = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1 });
                        for (let i = 0; i < Math.min(20, json.length); i++) {
                            const rowStr = (json[i] || []).join(' ');
                            if (rowStr.includes('이름') && (rowStr.includes('국어') || rowStr.includes('수학'))) return true;
                        }
                        return false;
                    }) || wb.SheetNames[0];
                    const jsonData = XLSX.utils.sheet_to_json(wb.Sheets[targetSheetName], { header: 1 });
                    resolve(parseExcel(jsonData, file.name));
                } catch (err) { console.error(err); resolve(null); }
            };
            reader.readAsArrayBuffer(file);
        }));

        const results = await Promise.all(promises);
        const validResults = results.filter(r => r && r.students.length > 0);
        if (!validResults.length) { hideLoading(); return alert('데이터를 찾을 수 없습니다.'); }

        state.gradeData = {};
        validResults.forEach(exam => {
            const gradeSet = new Set(exam.students.map(s => s.info.grade));
            gradeSet.forEach(grade => {
                if (!state.gradeData[grade]) state.gradeData[grade] = [];
                const gradeStudents = exam.students.filter(s => s.info.grade === grade);
                gradeStudents.sort((a, b) => b.totalRaw - a.totalRaw);
                gradeStudents.forEach((s, idx) => { s.totalRank = idx + 1; });
                state.gradeData[grade].push({ name: exam.name, students: gradeStudents });
            });
        });

        Object.keys(state.gradeData).forEach(grade => {
            state.gradeData[grade].sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
        });

        state.availableGrades = Object.keys(state.gradeData).map(Number).sort((a, b) => a - b);

        if (state.availableGrades.length) {
            hideLoading();
            document.getElementById('results').style.display = 'block';
            document.getElementById('saveHtmlBtn').style.display = 'inline-flex';
            updateLastUpdated();
            initSelectors();
        } else { hideLoading(); alert('데이터를 찾을 수 없습니다.'); }
    } catch (error) { hideLoading(); alert('파일 분석 중 오류가 발생했습니다: ' + error.message); }
}

/* ── 엑셀 파싱 (선택과목명 포함) ── */
function parseExcel(rows, fname) {
    let startRow = -1;
    for (let i = 0; i < rows.length; i++) {
        if (!rows[i]) continue;
        const rowStr = rows[i].map(c => String(c).replace(/\s/g, '')).join(',');
        if (rowStr.includes('이름') && rowStr.includes('번호')) { startRow = i; break; }
    }
    if (startRow === -1) return null;

    const students = [];
    const val = (r, i) => Number(r[i]) || 0;
    const grd = (r, i) => { const v = Number(r[i]); return (v > 0 && v < 10) ? v : 9; };
    const str = (r, i) => (r[i] && String(r[i]).trim() !== '' && String(r[i]).trim() !== 'nan') ? String(r[i]).trim() : '';

    for (let i = startRow + 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r[4]) continue;

        const s = {
            info: { grade: parseInt(r[1]), class: parseInt(r[2]), no: parseInt(r[3]), name: r[4] },
            hist: { raw: val(r, 5), grd: grd(r, 6), std: 0, pct: 0, name: '' },
            kor:  { name: str(r, 7), raw: val(r, 8), std: val(r, 9), pct: val(r, 10), grd: grd(r, 11) },
            math: { name: str(r, 12), raw: val(r, 13), std: val(r, 14), pct: val(r, 15), grd: grd(r, 16) },
            eng:  { raw: val(r, 17), grd: grd(r, 18), std: 0, pct: 0, name: '' },
            inq1: { name: str(r, 19), raw: val(r, 20), std: val(r, 21), pct: val(r, 22), grd: grd(r, 23) },
            inq2: { name: str(r, 24), raw: val(r, 25), std: val(r, 26), pct: val(r, 27), grd: grd(r, 28) },
            uid: `${parseInt(r[2])}-${parseInt(r[3])}-${r[4]}`
        };

        s.totalRaw = s.kor.raw + s.math.raw + s.eng.raw + s.inq1.raw + s.inq2.raw + s.hist.raw;
        s.totalStd = s.kor.std + s.math.std + s.inq1.std + s.inq2.std;
        s.totalPct = parseFloat((s.kor.pct + s.math.pct + s.inq1.pct + s.inq2.pct).toFixed(2));
        students.push(s);
    }
    students.sort((a, b) => b.totalRaw - a.totalRaw);
    students.forEach((s, idx) => { s.totalRank = idx + 1; });
    return { name: fname.replace(/\.[^/.]+$/, ""), students };
}

function initSelectors() {
    if (!state.availableGrades.length) return;
    updateGradeSelectors();
    const defaultGrade = state.availableGrades[0];
    state.currentGradeTotal = defaultGrade;
    document.getElementById('gradeSelectTotal').value = defaultGrade;
    updateExamSelector('examSelectTotal', defaultGrade);
    state.currentGradeClass = defaultGrade;
    document.getElementById('gradeSelectClass').value = defaultGrade;
    updateExamSelector('examSelectClass', defaultGrade);
    updateClassSelector('classSelect', defaultGrade);
    state.currentGradeIndiv = defaultGrade;
    document.getElementById('gradeSelectIndiv').value = defaultGrade;
    updateExamSelector('indivExamSelect', defaultGrade);
    updateClassSelector('indivClassSelect', defaultGrade);
    switchTab('overall');
    renderOverall();
    renderClass();
    updateIndivList();
}

function switchTab(t) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(t + '-tab').classList.add('active');
    document.querySelector(`.tab-btn[data-tab="${t}"]`).classList.add('active');
    if (t === 'overall' && state.charts.bubble) state.charts.bubble.resize();
}

/* ── 유틸: 학생 배열에서 영역별 선택과목 그룹 추출 ── */
function getChoiceGroups(students, areaKey) {
    // 해당 영역에서 어떤 선택과목들이 있는지 + 학생 분류
    const groups = {};
    students.forEach(s => {
        const subj = s[areaKey];
        const choiceName = subj.name || '(미분류)';
        if (!groups[choiceName]) groups[choiceName] = [];
        groups[choiceName].push(s);
    });
    return groups;
}

/* ── 과목 카드 HTML (학생 배열 기반) ── */
function buildSubjectCardHTML(title, studentsInGroup, areaKey, metric) {
    const isAbs = (areaKey === 'eng' || areaKey === 'hist');
    const scores = studentsInGroup.map(s => isAbs ? s[areaKey].raw : (s[areaKey][metric] || 0)).filter(v => v > 0);
    const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '-';
    const std = scores.length ? Math.sqrt(scores.reduce((a, b) => a + Math.pow(b - parseFloat(avg), 2), 0) / scores.length).toFixed(1) : '-';
    const maxScore = scores.length ? Math.max(...scores).toFixed(1) : '-';
    const counts = Array(9).fill(0);
    studentsInGroup.forEach(s => { if (s[areaKey].grd >= 1 && s[areaKey].grd <= 9) counts[s[areaKey].grd - 1]++; });
    return buildCardInnerHTML(title, scores.length, avg, std, maxScore, counts);
}

/* ── 과목 카드 HTML (entry 배열 기반 — 탐구 통합용) ── */
function buildEntryCardHTML(title, entries, metric) {
    const scores = entries.map(e => {
        if (metric === 'raw') return e.raw;
        if (metric === 'std') return e.std;
        return e.pct;
    }).filter(v => v > 0);
    const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '-';
    const std = scores.length ? Math.sqrt(scores.reduce((a, b) => a + Math.pow(b - parseFloat(avg), 2), 0) / scores.length).toFixed(1) : '-';
    const maxScore = scores.length ? Math.max(...scores).toFixed(1) : '-';
    const counts = Array(9).fill(0);
    entries.forEach(e => { if (e.grd >= 1 && e.grd <= 9) counts[e.grd - 1]++; });
    return buildCardInnerHTML(title, entries.length, avg, std, maxScore, counts);
}

/* ── 카드 공통 내부 HTML ── */
function buildCardInnerHTML(title, count, avg, std, maxScore, counts) {
    return `
        <div class="subject-card">
            <div class="subject-card-header">
                <h4>${title}</h4>
                <span class="count-badge">응시 ${count}명</span>
            </div>
            <div class="subject-stats">
                <div class="stat-item"><div class="stat-label">평균</div><div class="stat-value-large">${avg}</div></div>
                <div class="stat-item"><div class="stat-label">표준편차</div><div class="stat-value-large">${std}</div></div>
                <div class="stat-item"><div class="stat-label">최고점</div><div class="stat-value-large">${maxScore}</div></div>
            </div>
            <div class="grade-distribution">
                ${counts.map((c, i) => {
                    const total = counts.reduce((a, b) => a + b, 0);
                    const pct = total ? ((c / total) * 100).toFixed(1) : 0;
                    return `<div class="grade-bar-item">
                        <div class="grade-label">${i + 1}등급</div>
                        <div class="grade-bar-container"><div class="grade-bar-fill g-${i + 1}" style="width: ${pct}%;"></div></div>
                        <div class="grade-count">${c}명</div>
                        <div class="grade-percentage">${pct}%</div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
}

/* ── 탐구영역 통합 그룹 추출 ── */
function getInquiryMergedGroups(students) {
    const allEntries = [];
    students.forEach(s => {
        if (s.inq1.name) allEntries.push({ ...s.inq1, student: s, source: 'inq1' });
        if (s.inq2.name) allEntries.push({ ...s.inq2, student: s, source: 'inq2' });
    });

    const socialGroup = {};
    const scienceGroup = {};
    const unknownGroup = {};

    allEntries.forEach(entry => {
        const cat = classifyInquiry(entry.name);
        const target = cat === 'social' ? socialGroup : (cat === 'science' ? scienceGroup : unknownGroup);
        if (!target[entry.name]) target[entry.name] = [];
        target[entry.name].push(entry);
    });

    return { socialGroup, scienceGroup, unknownGroup, allEntries };
}

/* ── 탐구 영역 통합 카드 HTML 생성 ── */
function buildInquiryAreaHTML(students, metric) {
    const { socialGroup, scienceGroup, unknownGroup } = getInquiryMergedGroups(students);
    let html = '';

    const socialNames = Object.keys(socialGroup).sort();
    const scienceNames = Object.keys(scienceGroup).sort();
    const unknownNames = Object.keys(unknownGroup).sort();

    if (socialNames.length > 0) {
        const allSocialEntries = socialNames.flatMap(n => socialGroup[n]);
        html += `<div class="area-section">
            <h4 class="area-title"><i class="fas fa-layer-group"></i> 사회탐구 영역</h4>
            <div class="subject-grid subject-grid-fixed">`;
        if (socialNames.length > 1) {
            html += buildEntryCardHTML('사회탐구 전체', allSocialEntries, metric);
        }
        socialNames.forEach(name => {
            html += buildEntryCardHTML(name, socialGroup[name], metric);
        });
        html += `</div></div>`;
    }

    if (scienceNames.length > 0) {
        const allScienceEntries = scienceNames.flatMap(n => scienceGroup[n]);
        html += `<div class="area-section">
            <h4 class="area-title"><i class="fas fa-layer-group"></i> 과학탐구 영역</h4>
            <div class="subject-grid subject-grid-fixed">`;
        if (scienceNames.length > 1) {
            html += buildEntryCardHTML('과학탐구 전체', allScienceEntries, metric);
        }
        scienceNames.forEach(name => {
            html += buildEntryCardHTML(name, scienceGroup[name], metric);
        });
        html += `</div></div>`;
    }

    if (unknownNames.length > 0) {
        html += `<div class="area-section">
            <h4 class="area-title"><i class="fas fa-layer-group"></i> 탐구 영역 (기타)</h4>
            <div class="subject-grid subject-grid-fixed">`;
        unknownNames.forEach(name => {
            html += buildEntryCardHTML(name, unknownGroup[name], metric);
        });
        html += `</div></div>`;
    }

    return html;
}

/* ── 모든 영역의 선택과목이 1개씩인지 판별 ── */
function checkSimpleMode(students) {
    // 국어, 수학: 선택과목 종류가 1개 이하
    for (const key of ['kor', 'math']) {
        const names = new Set();
        students.forEach(s => {
            const n = s[key].name;
            if (n && n.trim() !== '' && n !== '(미분류)') names.add(n.trim());
        });
        if (names.size > 1) return false;
    }

    // 탐구: 사회탐구 과목이 2개 이상이거나 과학탐구 과목이 2개 이상이면 복합모드
    const { socialGroup, scienceGroup, unknownGroup } = getInquiryMergedGroups(students);
    const socialNames = Object.keys(socialGroup);
    const scienceNames = Object.keys(scienceGroup);
    const unknownNames = Object.keys(unknownGroup);

    if (socialNames.length > 1 || scienceNames.length > 1 || unknownNames.length > 0) return false;

    return true;
}

/* ── 단일 영역 카드 생성 (선택과목 1개면 간소화) ── */
function buildSingleAreaHTML(students, areaKey, areaName, hasChoice, metric) {
    if (!hasChoice) {
        return `<div class="subject-grid subject-grid-fixed">${buildSubjectCardHTML(areaName, students, areaKey, metric)}</div>`;
    }

    const groups = getChoiceGroups(students, areaKey);
    const sortedNames = Object.keys(groups).filter(n => n !== '(미분류)' || groups[n].length > 0).sort();
    const realNames = sortedNames.filter(n => n !== '(미분류)');

    if (realNames.length <= 1) {
        return `<div class="subject-grid subject-grid-fixed">${buildSubjectCardHTML(realNames[0] || areaName, students, areaKey, metric)}</div>`;
    }

    let html = `<div class="subject-grid subject-grid-fixed">`;
    html += buildSubjectCardHTML(`${areaName} 전체`, students, areaKey, metric);
    sortedNames.forEach(choiceName => {
        html += buildSubjectCardHTML(choiceName, groups[choiceName], areaKey, metric);
    });
    html += `</div>`;
    return html;
}

/* ==============================
   전체통계 탭
   ============================== */
window.changeMetric = function (m) {
    state.metric = m;
    document.querySelectorAll('#overall-tab .opt-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-' + m).classList.add('active');
    renderOverall();
};

function renderOverall() {
    const grade = state.currentGradeTotal || state.availableGrades[0];
    const exams = getExamsForGrade(grade);
    const examSelect = document.getElementById('examSelectTotal');
    if (!examSelect || !exams.length) return;
    const examIdx = parseInt(examSelect.value) || 0;
    if (!exams[examIdx]) return;
    const students = exams[examIdx].students;
    const metric = state.metric;

    /* ── 버블 차트 (성적 분포) ── */
    const classes = [...new Set(students.map(s => s.info.class))].sort((a, b) => a - b);
    const maxClass = Math.max(...classes) || 12;
    const bubbleData = [];
    classes.forEach(c => {
        const cls = students.filter(s => s.info.class == c).sort((a, b) => b.totalRaw - a.totalRaw);
        cls.forEach((s, idx) => {
            const ratio = idx / (cls.length - 1 || 1);
            const r = ratio < 0.5 ? Math.floor(255 * (ratio * 2)) : 255;
            const g = ratio < 0.5 ? 255 : Math.floor(255 * (2 - ratio * 2));
            let score = metric === 'raw' ? s.totalRaw : (metric === 'std' ? s.totalStd : s.totalPct);
            bubbleData.push({ x: Number(c), y: score, r: 8, bg: `rgba(${r}, ${g}, 0, 0.8)`, name: s.info.name });
        });
    });
    const classScoreAvgData = classes.map(c => {
        const cls = students.filter(s => s.info.class == c);
        const avg = cls.reduce((sum, s) => sum + (metric === 'raw' ? s.totalRaw : (metric === 'std' ? s.totalStd : s.totalPct)), 0) / cls.length;
        return { x: Number(c), y: parseFloat(avg.toFixed(1)), r: 12, name: `${c}반 평균` };
    });

    if (state.charts.bubble) state.charts.bubble.destroy();
    state.charts.bubble = new Chart(document.getElementById('bubbleChart'), {
        type: 'bubble',
        data: {
            datasets: [
                { label: '학생', data: bubbleData, backgroundColor: bubbleData.map(d => d.bg), borderColor: 'transparent' },
                { label: '반 평균', data: classScoreAvgData, backgroundColor: 'rgba(80, 80, 220, 0.85)', borderColor: 'rgba(50, 50, 180, 1)', borderWidth: 1.5 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { min: 0, max: maxClass + 1, ticks: { stepSize: 1, callback: v => (Number.isInteger(v) && v > 0 && v <= maxClass) ? v + "반" : "" } },
                y: { title: { display: true, text: metric === 'raw' ? '원점수 합' : (metric === 'std' ? '표준점수 합' : '백분위 합') } }
            },
            plugins: {
                legend: { display: true, position: 'top', labels: { usePointStyle: true, pointStyle: 'circle', font: { size: 11 } } },
                datalabels: { display: false },
                tooltip: { callbacks: { label: c => c.datasetIndex === 1 ? `${c.raw.name}: ${c.raw.y}` : `${c.raw.x}반 ${c.raw.name}: ${c.raw.y.toFixed(1)}` } }
            }
        }
    });

    /* ── 버블 차트 (평균등급) ── */
    const getAvgGradeVal = s => (s.kor.grd + s.math.grd + s.eng.grd + (s.inq1.grd + s.inq2.grd) / 2) / 4;
    const gradeBubbleData = [];
    classes.forEach(c => {
        const cls = students.filter(s => s.info.class == c).sort((a, b) => getAvgGradeVal(a) - getAvgGradeVal(b));
        cls.forEach((s, idx) => {
            const avgGrd = getAvgGradeVal(s);
            const ratio = idx / (cls.length - 1 || 1);
            const r = ratio < 0.5 ? Math.floor(255 * (ratio * 2)) : 255;
            const g = ratio < 0.5 ? 255 : Math.floor(255 * (2 - ratio * 2));
            gradeBubbleData.push({ x: Number(c), y: parseFloat(avgGrd.toFixed(2)), r: 8, bg: `rgba(${r}, ${g}, 0, 0.8)`, name: s.info.name });
        });
    });
    const classGradeAvgData = classes.map(c => {
        const cls = students.filter(s => s.info.class == c);
        const avg = cls.reduce((sum, s) => sum + getAvgGradeVal(s), 0) / cls.length;
        return { x: Number(c), y: parseFloat(avg.toFixed(2)), r: 12, name: `${c}반 평균` };
    });

    if (state.charts.gradesBubble) state.charts.gradesBubble.destroy();
    state.charts.gradesBubble = new Chart(document.getElementById('gradesBubbleChart'), {
        type: 'bubble',
        data: {
            datasets: [
                { label: '학생', data: gradeBubbleData, backgroundColor: gradeBubbleData.map(d => d.bg), borderColor: 'transparent' },
                { label: '반 평균', data: classGradeAvgData, backgroundColor: 'rgba(80, 80, 220, 0.85)', borderColor: 'rgba(50, 50, 180, 1)', borderWidth: 1.5 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { min: 0, max: maxClass + 1, ticks: { stepSize: 1, callback: v => (Number.isInteger(v) && v > 0 && v <= maxClass) ? v + "반" : "" } },
                y: { reverse: true, min: 0, max: 9.5, ticks: { stepSize: 1, callback: v => (Number.isInteger(v) && v >= 1 && v <= 9) ? v + "등급" : "" }, title: { display: true, text: '평균등급' } }
            },
            plugins: {
                legend: { display: true, position: 'top', labels: { usePointStyle: true, pointStyle: 'circle', font: { size: 11 } } },
                datalabels: { display: false },
                tooltip: { callbacks: { label: c => c.datasetIndex === 1 ? `${c.raw.name}: ${c.raw.y}등급` : `${c.raw.x}반 ${c.raw.name}: ${c.raw.y}등급` } }
            }
        }
    });

    /* ── 영역별 선택과목 종합 분석 카드 ── */
    const container = document.getElementById('combinedStatsContainer');
    container.innerHTML = '';

    // 선택과목이 모두 단일인지 판별
    const isSimpleMode = checkSimpleMode(students);

    if (isSimpleMode) {
        // V13 스타일: area-section 없이 6개 카드를 3\times2 그리드로 배치
        const simpleSubjects = [
            { k: 'kor',  n: '국어' },
            { k: 'math', n: '수학' },
            { k: 'eng',  n: '영어' },
            { k: 'hist', n: '한국사' },
            { k: 'inq1', n: '사회탐구' },
            { k: 'inq2', n: '과학탐구' }
        ];
        container.innerHTML = `<div class="subject-grid subject-grid-fixed">`;
        simpleSubjects.forEach(sub => {
            container.innerHTML += buildSubjectCardHTML(sub.n, students, sub.k, metric);
        });
        // innerHTML 연결 방식으로는 닫는 div가 안 들어가므로 별도 처리
        const wrapper = document.createElement('div');
        wrapper.className = 'subject-grid subject-grid-fixed';
        simpleSubjects.forEach(sub => {
            wrapper.innerHTML += buildSubjectCardHTML(sub.n, students, sub.k, metric);
        });
        container.innerHTML = '';
        container.appendChild(wrapper);
    } else {
        // 선택과목 다수: 영역별 area-section 분리
        ['kor', 'math', 'eng', 'hist'].forEach(key => {
            const area = areas.find(a => a.k === key);
            let areaHTML = `<div class="area-section">
                <h4 class="area-title"><i class="fas fa-layer-group"></i> ${area.n}</h4>`;
            areaHTML += buildSingleAreaHTML(students, area.k, area.n, area.hasChoice, metric);
            areaHTML += `</div>`;
            container.innerHTML += areaHTML;
        });

        // 탐구영역 통합 (사회탐구 / 과학탐구)
        container.innerHTML += buildInquiryAreaHTML(students, metric);
    }

    /* ── 전체 성적 일람표 (동적 헤더) ── */
    buildTotalTable(students, metric);

    /* ── 등급 필터 UI ── */
    initGradeFilter(students);
}

/* ── 전체 일람표 동적 헤더 ── */
function buildTotalTable(students, metric) {
    const thead = document.getElementById('totalTableHead');
    const tbody = document.getElementById('totalTableBody');

    // 영역별 선택과목 목록 수집
    const areaChoices = {};
    areas.forEach(area => {
        if (area.hasChoice) {
            const names = new Set();
            students.forEach(s => {
                const n = s[area.k].name || '(미분류)';
                names.add(n);
            });
            areaChoices[area.k] = [...names].sort();
        }
    });

    // 헤더 1행: 석차, 학번, 이름, 각 영역 (colspan 결정)
    let h1 = `<tr><th rowspan="2">석차</th><th rowspan="2">학번</th><th rowspan="2">이름</th>`;
    let h2 = `<tr>`;

    areas.forEach(area => {
        const isAbs = (area.k === 'eng' || area.k === 'hist');
        if (area.hasChoice) {
            // 선택과목 컬럼: 선택과목명, 점수, 등급 = 3열
            h1 += `<th colspan="3">${area.n}</th>`;
            h2 += `<th>선택과목</th><th>점수</th><th>등급</th>`;
        } else {
            h1 += `<th colspan="2">${area.n}</th>`;
            h2 += `<th>점수</th><th>등급</th>`;
        }
    });

    h1 += `<th rowspan="2" class="total-col">총점</th><th rowspan="2" class="total-col">평균등급</th></tr>`;
    h2 += `</tr>`;
    thead.innerHTML = h1 + h2;

    // 본문
    const getTot = s => metric === 'raw' ? s.totalRaw : (metric === 'std' ? s.totalStd.toFixed(1) : s.totalPct.toFixed(1));
    const getAvgGrade = s => ((s.kor.grd + s.math.grd + s.eng.grd + (s.inq1.grd + s.inq2.grd) / 2) / 4).toFixed(2);

    tbody.innerHTML = '';
    students.slice(0, 500).forEach(s => {
        let row = `<tr>`;
        row += `<td style="font-weight:bold;color:var(--primary);">${s.totalRank}</td>`;
        row += `<td>${s.info.grade}${String(s.info.class).padStart(2, '0')}${String(s.info.no).padStart(2, '0')}</td>`;
        row += `<td style="font-weight:bold;">${s.info.name}</td>`;

        areas.forEach(area => {
            const isAbs = (area.k === 'eng' || area.k === 'hist');
            const subj = s[area.k];
            if (area.hasChoice) {
                const scoreVal = isAbs ? subj.raw : (subj[metric] || '-');
                row += `<td style="font-size:0.75rem;color:var(--text-secondary);">${subj.name || '-'}</td>`;
                row += `<td>${scoreVal}</td>`;
                row += `<td class="g-${subj.grd}">${subj.grd}</td>`;
            } else {
                row += `<td>${subj.raw}</td>`;
                row += `<td class="g-${subj.grd}">${subj.grd}</td>`;
            }
        });

        row += `<td class="total-col">${getTot(s)}</td>`;
        row += `<td class="total-col" style="font-weight:bold;color:var(--primary);">${getAvgGrade(s)}</td>`;
        row += `</tr>`;
        tbody.innerHTML += row;
    });
}

/* ── 등급 필터 (영역별 선택과목별) ── */
function initGradeFilter(students) {
    const group = document.getElementById('gradeFilterGroup');
    if (!group) return;

    const isSimple = checkSimpleMode(students);

    if (isSimple) {
        // V13 스타일: 단순 6과목 행
        const filterSubjects = [
            { k: 'kor',  n: '국어' },
            { k: 'math', n: '수학' },
            { k: 'eng',  n: '영어' },
            { k: 'hist', n: '한국사' },
            { k: 'inq1', n: '사회탐구' },
            { k: 'inq2', n: '과학탐구' }
        ];

        const gradeCounts = {};
        filterSubjects.forEach(sub => {
            gradeCounts[sub.k] = Array(9).fill(0);
            students.forEach(s => {
                const g = s[sub.k].grd;
                if (g >= 1 && g <= 9) gradeCounts[sub.k][g - 1]++;
            });
        });

        group.innerHTML = filterSubjects.map(sub => `
            <div class="grade-filter-subject">
                <div class="grade-filter-subject-label">${sub.n}</div>
                <div class="grade-filter-btns">
                    ${Array.from({length: 9}, (_, i) => i + 1).map(g => `
                        <button class="grade-filter-btn g-btn-${sub.k}-${g}"
                            onclick="renderGradeFilter('${sub.k}', ${g}, 'all')"
                            title="${g}등급: ${gradeCounts[sub.k][g-1]}명">
                            ${g}등급
                            <span class="grade-filter-count">${gradeCounts[sub.k][g-1]}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
        `).join('');
    } else {
        // 복합모드: 영역별 헤더 + 선택과목별 행
        let html = '';

        // 국어, 수학, 영어, 한국사
        ['kor', 'math', 'eng', 'hist'].forEach(key => {
            const area = areas.find(a => a.k === key);
            html += `<div class="grade-filter-area-header">${area.n}</div>`;

            if (area.hasChoice) {
                const groups = getChoiceGroups(students, key);
                const sortedNames = Object.keys(groups).sort();
                const realNames = sortedNames.filter(n => n !== '(미분류)');

                if (realNames.length <= 1) {
                    const counts = Array(9).fill(0);
                    students.forEach(s => { const g = s[key].grd; if (g >= 1 && g <= 9) counts[g - 1]++; });
                    html += buildFilterSubjectRow(realNames[0] || area.n, key, 'all', counts);
                } else {
                    const allCounts = Array(9).fill(0);
                    students.forEach(s => { const g = s[key].grd; if (g >= 1 && g <= 9) allCounts[g - 1]++; });
                    html += buildFilterSubjectRow(`${area.n} 전체`, key, 'all', allCounts);

                    sortedNames.forEach(choiceName => {
                        const grp = groups[choiceName];
                        const counts = Array(9).fill(0);
                        grp.forEach(s => { const g = s[key].grd; if (g >= 1 && g <= 9) counts[g - 1]++; });
                        html += buildFilterSubjectRow(`└ ${choiceName}`, key, choiceName, counts, true);
                    });
                }
            } else {
                const counts = Array(9).fill(0);
                students.forEach(s => { const g = s[key].grd; if (g >= 1 && g <= 9) counts[g - 1]++; });
                html += buildFilterSubjectRow(area.n, key, 'all', counts);
            }
        });

        // 탐구영역 통합 필터
        const { socialGroup, scienceGroup, unknownGroup } = getInquiryMergedGroups(students);

        const socialNames = Object.keys(socialGroup).sort();
        if (socialNames.length > 0) {
            html += `<div class="grade-filter-area-header">사회탐구 영역</div>`;
            if (socialNames.length > 1) {
                const allEntries = socialNames.flatMap(n => socialGroup[n]);
                const allCounts = Array(9).fill(0);
                allEntries.forEach(e => { if (e.grd >= 1 && e.grd <= 9) allCounts[e.grd - 1]++; });
                html += buildFilterSubjectRow('사회탐구 전체', 'inq_social', 'all', allCounts);
            }
            socialNames.forEach(name => {
                const entries = socialGroup[name];
                const counts = Array(9).fill(0);
                entries.forEach(e => { if (e.grd >= 1 && e.grd <= 9) counts[e.grd - 1]++; });
                html += buildFilterSubjectRow(socialNames.length > 1 ? `└ ${name}` : name, 'inq_social', name, counts, socialNames.length > 1);
            });
        }

        const scienceNames = Object.keys(scienceGroup).sort();
        if (scienceNames.length > 0) {
            html += `<div class="grade-filter-area-header">과학탐구 영역</div>`;
            if (scienceNames.length > 1) {
                const allEntries = scienceNames.flatMap(n => scienceGroup[n]);
                const allCounts = Array(9).fill(0);
                allEntries.forEach(e => { if (e.grd >= 1 && e.grd <= 9) allCounts[e.grd - 1]++; });
                html += buildFilterSubjectRow('과학탐구 전체', 'inq_science', 'all', allCounts);
            }
            scienceNames.forEach(name => {
                const entries = scienceGroup[name];
                const counts = Array(9).fill(0);
                entries.forEach(e => { if (e.grd >= 1 && e.grd <= 9) counts[e.grd - 1]++; });
                html += buildFilterSubjectRow(scienceNames.length > 1 ? `└ ${name}` : name, 'inq_science', name, counts, scienceNames.length > 1);
            });
        }

        const unknownNames = Object.keys(unknownGroup).sort();
        if (unknownNames.length > 0) {
            html += `<div class="grade-filter-area-header">탐구 영역 (기타)</div>`;
            unknownNames.forEach(name => {
                const entries = unknownGroup[name];
                const counts = Array(9).fill(0);
                entries.forEach(e => { if (e.grd >= 1 && e.grd <= 9) counts[e.grd - 1]++; });
                html += buildFilterSubjectRow(name, 'inq_unknown', name, counts, false);
            });
        }

        group.innerHTML = html;
    }

    document.getElementById('gradeFilterResult').style.display = 'none';
    document.getElementById('gradeFilterEmpty').style.display = 'none';
}

function buildFilterSubjectRow(label, filterArea, filterChoice, counts, indented) {
    const safeChoice = String(filterChoice).replace(/'/g, "\\'");
    return `<div class="grade-filter-subject">
        <div class="grade-filter-subject-label" ${indented ? 'style="padding-left:16px;"' : ''}>${label}</div>
        <div class="grade-filter-btns">
            ${Array.from({length: 9}, (_, i) => i + 1).map(g => `
                <button class="grade-filter-btn"
                    onclick="renderGradeFilter('${filterArea}', ${g}, '${safeChoice}')"
                    title="${g}등급: ${counts[g-1]}명">
                    ${g}등급 <span class="grade-filter-count">${counts[g-1]}</span>
                </button>`).join('')}
        </div>
    </div>`;
}

window.renderGradeFilter = function(filterArea, gradeLevel, choiceFilter) {
    // 활성 버튼 처리
    document.querySelectorAll('.grade-filter-btn.active').forEach(b => b.classList.remove('active'));

    // 단순모드에서는 g-btn-{key}-{grade} 클래스로 찾기
    const simpleBtnSelector = `.g-btn-${filterArea}-${gradeLevel}`;
    const simpleBtn = document.querySelector(simpleBtnSelector);
    if (simpleBtn) {
        simpleBtn.classList.add('active');
    } else {
        document.querySelectorAll('.grade-filter-btn').forEach(btn => {
            const oc = btn.getAttribute('onclick') || '';
            if (oc.includes(`'${filterArea}', ${gradeLevel}`) && oc.includes(`'${choiceFilter}'`)) {
                btn.classList.add('active');
            }
        });
    }

    const currentGrade = state.currentGradeTotal || state.availableGrades[0];
    const exams = getExamsForGrade(currentGrade);
    const examSelect = document.getElementById('examSelectTotal');
    const examIdx = parseInt(examSelect.value) || 0;
    const students = exams[examIdx]?.students || [];

    let filtered = [];
    let isInquiry = filterArea.startsWith('inq_');
    let displayLabel = '';

    if (isInquiry) {
        // 탐구 통합 필터
        const { socialGroup, scienceGroup, unknownGroup } = getInquiryMergedGroups(students);
        let targetGroup = {};
        let categoryName = '';

        if (filterArea === 'inq_social') {
            targetGroup = socialGroup;
            categoryName = '사회탐구 영역';
        } else if (filterArea === 'inq_science') {
            targetGroup = scienceGroup;
            categoryName = '과학탐구 영역';
        } else {
            targetGroup = unknownGroup;
            categoryName = '탐구 영역 (기타)';
        }

        let entries = [];
        if (choiceFilter === 'all') {
            entries = Object.values(targetGroup).flat();
            displayLabel = categoryName;
        } else {
            entries = targetGroup[choiceFilter] || [];
            displayLabel = `${categoryName} - ${choiceFilter}`;
        }

        entries = entries.filter(e => e.grd === gradeLevel);
        entries.sort((a, b) => b.raw - a.raw);

        const resultEl = document.getElementById('gradeFilterResult');
        const emptyEl = document.getElementById('gradeFilterEmpty');
        const summaryEl = document.getElementById('gradeFilterSummary');
        const theadEl = document.getElementById('gradeFilterThead');
        const tbodyEl = document.getElementById('gradeFilterTbody');

        if (entries.length === 0) {
            resultEl.style.display = 'none';
            emptyEl.style.display = 'flex';
            return;
        }
        emptyEl.style.display = 'none';
        resultEl.style.display = 'block';

        summaryEl.innerHTML = `<span class="grade-filter-summary-text">
            <strong>${displayLabel}</strong>
            <span class="grade-badge g-${gradeLevel}">${gradeLevel}등급</span>
            해당 학생 <strong>${entries.length}명</strong>
        </span>`;

        theadEl.innerHTML = `<tr>
            <th>학번</th><th>이름</th><th>선택과목</th><th>영역</th><th>원점수</th><th>등급</th><th>표준점수</th><th>백분위</th>
        </tr>`;

        tbodyEl.innerHTML = entries.map(e => {
            const s = e.student;
            const id = `${s.info.grade}${String(s.info.class).padStart(2,'0')}${String(s.info.no).padStart(2,'0')}`;
            const srcLabel = e.source === 'inq1' ? '탐구1' : '탐구2';
            return `<tr>
                <td>${id}</td>
                <td style="font-weight:bold;">${s.info.name}</td>
                <td style="font-size:0.8rem;color:var(--text-secondary);">${e.name || '-'}</td>
                <td style="font-size:0.75rem;">${srcLabel}</td>
                <td>${e.raw}</td>
                <td class="g-${e.grd}">${e.grd}</td>
                <td>${e.std || '-'}</td>
                <td>${e.pct || '-'}</td>
            </tr>`;
        }).join('');
        return;
    }

    // 일반 영역 (kor, math, eng, hist)
    const area = areas.find(a => a.k === filterArea);
    const isAbs = (filterArea === 'eng' || filterArea === 'hist');

    filtered = students.filter(s => s[filterArea].grd === gradeLevel);
    if (choiceFilter !== 'all') {
        filtered = filtered.filter(s => (s[filterArea].name || '(미분류)') === choiceFilter);
    }
    filtered.sort((a, b) => {
        const diff = b[filterArea].raw - a[filterArea].raw;
        return diff !== 0 ? diff : (a.info.class * 100 + a.info.no) - (b.info.class * 100 + b.info.no);
    });

    displayLabel = choiceFilter === 'all' ? area.n : `${area.n} - ${choiceFilter}`;

    const resultEl = document.getElementById('gradeFilterResult');
    const emptyEl = document.getElementById('gradeFilterEmpty');
    const summaryEl = document.getElementById('gradeFilterSummary');
    const theadEl = document.getElementById('gradeFilterThead');
    const tbodyEl = document.getElementById('gradeFilterTbody');

    if (filtered.length === 0) {
        resultEl.style.display = 'none';
        emptyEl.style.display = 'flex';
        return;
    }
    emptyEl.style.display = 'none';
    resultEl.style.display = 'block';

    summaryEl.innerHTML = `<span class="grade-filter-summary-text">
        <strong>${displayLabel}</strong>
        <span class="grade-badge g-${gradeLevel}">${gradeLevel}등급</span>
        해당 학생 <strong>${filtered.length}명</strong>
    </span>`;

    theadEl.innerHTML = `<tr>
        <th>학번</th><th>이름</th>${area.hasChoice ? '<th>선택과목</th>' : ''}<th>원점수</th><th>등급</th>
        ${!isAbs ? '<th>표준점수</th><th>백분위</th>' : ''}
    </tr>`;

    tbodyEl.innerHTML = filtered.map(s => {
        const sub = s[filterArea];
        const id = `${s.info.grade}${String(s.info.class).padStart(2,'0')}${String(s.info.no).padStart(2,'0')}`;
        return `<tr>
            <td>${id}</td>
            <td style="font-weight:bold;">${s.info.name}</td>
            ${area.hasChoice ? `<td style="font-size:0.8rem;color:var(--text-secondary);">${sub.name || '-'}</td>` : ''}
            <td>${sub.raw}</td>
            <td class="g-${sub.grd}">${sub.grd}</td>
            ${!isAbs ? `<td>${sub.std || '-'}</td><td>${sub.pct || '-'}</td>` : ''}
        </tr>`;
    }).join('');
};

/* ==============================
   학급통계 탭
   ============================== */
window.changeClassMetric = function (m) {
    state.classMetric = m;
    document.querySelectorAll('#class-tab .opt-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-c-' + m).classList.add('active');
    renderClass();
};
window.sortClass = function (t) {
    state.classSort = t;
    document.getElementById('btn-sort-total').classList.remove('active');
    document.getElementById('btn-sort-no').classList.remove('active');
    document.getElementById('btn-sort-' + t).classList.add('active');
    renderClass();
};

function renderClass() {
    const grade = state.currentGradeClass || state.availableGrades[0];
    if (!grade) return;
    const exams = getExamsForGrade(grade);
    const examSelect = document.getElementById('examSelectClass');
    const classSelect = document.getElementById('classSelect');
    if (!examSelect || !classSelect || !exams.length) return;
    const examIdx = parseInt(examSelect.value) || 0;
    if (!exams[examIdx]) return;
    const studentsAll = exams[examIdx].students;
    const cls = parseInt(classSelect.value);
    if (isNaN(cls)) return;
    const metric = state.classMetric;

    let students = studentsAll.filter(s => s.info.class === cls);
    const getTot = s => metric === 'raw' ? s.totalRaw : (metric === 'std' ? s.totalStd.toFixed(1) : s.totalPct.toFixed(1));
    if (state.classSort === 'total') students.sort((a, b) => parseFloat(getTot(b)) - parseFloat(getTot(a)));
    else students.sort((a, b) => a.info.no - b.info.no);

    /* ── 학급 영역별 선택과목 카드 ── */
    const container = document.getElementById('classStatsContainer');
    if (container) {
        container.innerHTML = '';

        const isSimple = checkSimpleMode(students);

        if (isSimple) {
            const simpleSubjects = [
                { k: 'kor',  n: '국어' },
                { k: 'math', n: '수학' },
                { k: 'eng',  n: '영어' },
                { k: 'hist', n: '한국사' },
                { k: 'inq1', n: '사회탐구' },
                { k: 'inq2', n: '과학탐구' }
            ];
            const wrapper = document.createElement('div');
            wrapper.className = 'subject-grid subject-grid-fixed';
            simpleSubjects.forEach(sub => {
                wrapper.innerHTML += buildSubjectCardHTML(sub.n, students, sub.k, metric);
            });
            container.appendChild(wrapper);
        } else {
            ['kor', 'math', 'eng', 'hist'].forEach(key => {
                const area = areas.find(a => a.k === key);
                let areaHTML = `<div class="area-section">
                    <h4 class="area-title"><i class="fas fa-layer-group"></i> ${area.n}</h4>`;
                areaHTML += buildSingleAreaHTML(students, area.k, area.n, area.hasChoice, metric);
                areaHTML += `</div>`;
                container.innerHTML += areaHTML;
            });
            container.innerHTML += buildInquiryAreaHTML(students, metric);
        }
    }

    /* ── 학급 일람표 (동적 헤더) ── */
    const thead = document.getElementById('classTableHead');
    const tbody = document.getElementById('classTableBody');

    let h1 = `<tr><th rowspan="2">번호</th><th rowspan="2">이름</th>`;
    let h2 = `<tr>`;

    areas.forEach(area => {
        if (area.hasChoice) {
            h1 += `<th colspan="3">${area.n}</th>`;
            h2 += `<th>선택과목</th><th>점수</th><th>등급</th>`;
        } else {
            h1 += `<th colspan="2">${area.n}</th>`;
            h2 += `<th>점수</th><th>등급</th>`;
        }
    });
    h1 += `<th rowspan="2" class="total-col">총점</th><th rowspan="2" class="total-col">석차</th><th rowspan="2" class="total-col">평균등급</th></tr>`;
    h2 += `</tr>`;
    thead.innerHTML = h1 + h2;

    const getAvgGrade = s => ((s.kor.grd + s.math.grd + s.eng.grd + (s.inq1.grd + s.inq2.grd) / 2) / 4).toFixed(2);
    tbody.innerHTML = '';
    students.forEach(s => {
        const rank = students.filter(st => parseFloat(getTot(st)) > parseFloat(getTot(s))).length + 1;
        let row = `<tr><td>${s.info.no}</td><td style="font-weight:bold;">${s.info.name}</td>`;

        areas.forEach(area => {
            const isAbs = (area.k === 'eng' || area.k === 'hist');
            const subj = s[area.k];
            if (area.hasChoice) {
                const scoreVal = isAbs ? subj.raw : (subj[metric] || '-');
                row += `<td style="font-size:0.75rem;color:var(--text-secondary);">${subj.name || '-'}</td>`;
                row += `<td>${scoreVal}</td>`;
                row += `<td class="g-${subj.grd}">${subj.grd}</td>`;
            } else {
                row += `<td>${subj.raw}</td>`;
                row += `<td class="g-${subj.grd}">${subj.grd}</td>`;
            }
        });

        row += `<td class="total-col">${getTot(s)}</td><td class="total-col">${rank}</td><td class="total-col" style="font-weight:bold;color:var(--primary);">${getAvgGrade(s)}</td></tr>`;
        tbody.innerHTML += row;
    });
}

/* ==============================
   개인통계 탭
   ============================== */
function updateIndivList() {
    const grade = state.currentGradeIndiv || state.availableGrades[0];
    if (!grade) return;
    const exams = getExamsForGrade(grade);
    if (!exams.length) return;
    const clsVal = document.getElementById('indivClassSelect')?.value;
    if (!clsVal) return;
    const cls = parseInt(clsVal);
    if (isNaN(cls)) return;
    const list = exams[0].students.filter(s => s.info.class === cls).sort((a, b) => a.info.no - b.info.no);
    document.getElementById('indivStudentSelect').innerHTML = list.map(s => `<option value="${s.uid}">${s.info.no}번 ${s.info.name}</option>`).join('');
    if (list.length > 0) renderIndividual();
}

function renderIndividual() {
    const sel = document.getElementById('indivStudentSelect');
    if (!sel || !sel.value) return;
    const uid = sel.value;
    const grade = state.currentGradeIndiv || state.availableGrades[0];
    if (!grade) return;
    const exams = getExamsForGrade(grade);
    if (!exams.length) return;

    const history = [];
    for (let i = exams.length - 1; i >= 0; i--) {
        const ex = exams[i];
        const s = ex.students.find(st => st.uid === uid);
        if (s) history.push({ name: ex.name, data: s });
    }
    if (!history.length) return;

    const selectedExamIdx = parseInt(document.getElementById('indivExamSelect')?.value) || 0;
    let currentData = exams[selectedExamIdx]?.students.find(st => st.uid === uid);
    let selectedExamName = exams[selectedExamIdx]?.name;
    if (!currentData) {
        currentData = history[history.length - 1].data;
        selectedExamName = history[history.length - 1].name;
    }

    document.getElementById('indivName').innerText = currentData.info.name;
    document.getElementById('indivInfo').innerText = `${currentData.info.grade}학년 ${currentData.info.class}반 ${currentData.info.no}번`;
    document.getElementById('latestExamName').innerText = `선택 시험: ${selectedExamName}`;
    document.getElementById('indivTotalRaw').innerText = currentData.totalRaw;
    document.getElementById('indivTotalStd').innerText = currentData.totalStd.toFixed(1);
    document.getElementById('indivTotalPct').innerText = currentData.totalPct.toFixed(2);
    document.getElementById('indivRank').innerText = currentData.totalRank;

    const inqAvgGrade = (currentData.inq1.grd + currentData.inq2.grd) / 2;
    const avgGrade = ((currentData.kor.grd + currentData.math.grd + currentData.eng.grd + inqAvgGrade) / 4).toFixed(2);
    document.getElementById('indivAverageGrade').innerText = avgGrade;

    // 총점 추이 차트
    drawChart('totalTrendChart', 'line', {
        labels: history.map(h => h.name),
        datasets: [{
            label: '총점(백분위합)', data: history.map(h => h.data.totalPct),
            borderColor: '#8B5A8D', backgroundColor: '#8B5A8D', tension: 0.3, borderWidth: 2, pointRadius: 4
        }]
    }, {
        scales: { y: { min: 0, max: 450, ticks: { stepSize: 50, callback: v => v === 450 ? '' : v } } },
        plugins: { datalabels: { display: true, color: '#8B5A8D', align: 'top', font: { weight: 'bold' }, formatter: v => v.toFixed(1) } }
    });

    // 레이더 차트 — 선택과목명 표시
    const radarLabels = ['국어', '수학', '영어', '탐1', '탐2'];
    const radarGrades = [
        currentData.kor.grd,
        currentData.math.grd,
        currentData.eng.grd,
        currentData.inq1.grd,
        currentData.inq2.grd
    ];

    drawChart('radarChart', 'radar', {
        labels: radarLabels,
        datasets: [{
            label: '등급', data: radarGrades,
            backgroundColor: 'rgba(100, 150, 200, 0.2)', borderColor: 'rgba(100, 150, 200, 0.6)',
            borderWidth: 2, pointBackgroundColor: radarPointColors, pointBorderColor: radarPointColors,
            pointBorderWidth: 2, pointRadius: 6, pointHoverRadius: 8
        }]
    }, {
        layout: { padding: { top: 30, bottom: 30, left: 50, right: 50 } },
        scales: {
            r: {
                reverse: true, min: 1, max: 9,
                ticks: { stepSize: 1, display: true, font: { size: 10 }, color: '#999', backdropColor: 'transparent' },
                grid: { circular: false, color: 'rgba(0, 0, 0, 0.1)' },
                angleLines: { display: true, color: 'rgba(0, 0, 0, 0.1)' },
                pointLabels: { font: { size: 13, weight: 'bold', family: "'Pretendard', sans-serif" }, color: radarPointColors, padding: 12 }
            }
        },
        plugins: {
            legend: { display: false },
            datalabels: {
                display: true,
                backgroundColor: function (ctx) { return ctx.dataset.data[ctx.dataIndex] <= 1.5 ? 'rgba(255,255,255,0.85)' : '#ffffff'; },
                borderColor: function (ctx) { return radarPointColors[ctx.dataIndex]; },
                borderWidth: 2, color: function (ctx) { return radarPointColors[ctx.dataIndex]; },
                borderRadius: 4, padding: { top: 3, bottom: 3, left: 6, right: 6 },
                font: { weight: 'bold', size: 10 }, formatter: (v) => v.toFixed(2) + '등급',
                anchor: 'center',
                align: function (ctx) {
                    const idx = ctx.dataIndex;
                    const count = ctx.dataset.data.length;
                    const angleDeg = 90 - (360 / count) * idx;
                    return angleDeg * Math.PI / 180 + Math.PI;
                },
                offset: function (ctx) {
                    const v = ctx.dataset.data[ctx.dataIndex];
                    const normalized = (v - 1) / 8;
                    return Math.round(4 + (1 - normalized) * 10);
                },
                clip: false
            }
        }
    });

    /* ── 과목별 상세 (영역 단위) ── */
    const detailContainer = document.getElementById('subjectDetailContainer');
    if (detailContainer) {
        state.subjectCharts.forEach(c => { try { c.destroy(); } catch (e) {} });
        state.subjectCharts = [];
        detailContainer.innerHTML = '';

        areas.forEach(area => {
            const k = area.k;
            const isAbs = (k === 'eng' || k === 'hist');

            // 영역명 + 선택과목명 결정
            let displayTitle = area.n;
            if (area.hasChoice && currentData[k].name) {
                displayTitle = `${area.n} (${currentData[k].name})`;
            }

            // 테이블 헤더: 각 회차
            let thead = `<tr><th>구분</th>` + history.map(h => `<th>${h.name}</th>`).join('') + `</tr>`;

            // 선택과목 행 (선택과목이 있는 영역만)
            let trChoice = '';
            if (area.hasChoice) {
                trChoice = `<tr><td style="font-weight:600;color:var(--text-secondary);">선택과목</td>` +
                    history.map(h => `<td style="font-size:0.78rem;color:var(--text-secondary);">${h.data[k].name || '-'}</td>`).join('') + `</tr>`;
            }

            let trGrd = `<tr><td>등급</td>` + history.map(h => `<td class="g-${h.data[k].grd}">${h.data[k].grd}</td>`).join('') + `</tr>`;
            let trRaw = `<tr><td>원점수</td>` + history.map(h => `<td>${h.data[k].raw}</td>`).join('') + `</tr>`;
            let trStd = `<tr><td>표준점수</td>` + history.map(h => `<td>${h.data[k].std || '-'}</td>`).join('') + `</tr>`;
            let trPct = `<tr><td>백분위</td>` + history.map(h => `<td>${h.data[k].pct || '-'}</td>`).join('') + `</tr>`;

            const chartId = `chart-${k}-${uid.replace(/[^a-zA-Z0-9]/g, '')}`;

            detailContainer.innerHTML += `
                <div class="chart-card subject-detail-card" data-subject="${k}">
                    <h3><i class="fas fa-book"></i> ${displayTitle} 성적 상세</h3>
                    <div class="subject-detail-grid">
                        <div class="chart-container" style="height: 200px; width: 100%;"><canvas id="${chartId}"></canvas></div>
                        <div class="table-wrapper">
                            <table class="data-table" style="font-size:0.8rem; min-width: 100%;">
                                <thead>${thead}</thead>
                                <tbody>${trChoice}${trGrd}${trRaw}${!isAbs ? trStd : ''}${!isAbs ? trPct : ''}</tbody>
                            </table>
                        </div>
                    </div>
                </div>`;

            setTimeout(() => {
                const ctx = document.getElementById(chartId);
                if (!ctx) return;
                const yVals = history.map(h => isAbs ? h.data[k].grd : h.data[k].pct);
                const chart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: history.map(h => h.name),
                        datasets: [{ label: isAbs ? '등급' : '백분위', data: yVals, borderColor: isAbs ? '#B8860B' : '#4A6B8A', tension: 0.1, borderWidth: 2, pointRadius: 4 }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            datalabels: { display: true, color: isAbs ? '#B8860B' : '#4A6B8A', align: 'top', font: { weight: 'bold' }, formatter: v => v > 100 ? '' : v }
                        },
                        scales: {
                            y: {
                                reverse: isAbs, min: isAbs ? 0 : 0, max: isAbs ? 9 : 120,
                                ticks: { stepSize: isAbs ? 1 : 20, callback: function (value) { if (isAbs && value === 0) return ''; return value; } }
                            }
                        }
                    }
                });
                state.subjectCharts.push(chart);
            }, 0);
        });
    }
}

function drawChart(id, type, data, options) {
    const ctx = document.getElementById(id);
    if (!ctx) return;
    if (state.charts[id]) state.charts[id].destroy();
    state.charts[id] = new Chart(ctx.getContext('2d'), { type, data, options });
}

function updateLastUpdated() {
    const now = new Date();
    const el = document.getElementById('lastUpdated');
    if (el) el.textContent = `Last updated: ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} (KST)`;
}

/* ── HTML 저장 ── */
window.saveHtmlFile = function () {
    try {
        const htmlContent = document.documentElement.cloneNode(true);
        htmlContent.querySelector('#uploadSection')?.remove();
        htmlContent.querySelector('#loading')?.remove();
        htmlContent.querySelector('#saveHtmlBtn')?.remove();
        const stateToSave = {
            gradeData: state.gradeData, availableGrades: state.availableGrades,
            currentGradeTotal: state.currentGradeTotal, currentGradeClass: state.currentGradeClass,
            currentGradeIndiv: state.currentGradeIndiv, metric: state.metric,
            classMetric: state.classMetric, classSort: state.classSort, charts: {}
        };
        const scriptTag = document.createElement('script');
        scriptTag.textContent = `window.SAVED_STATE = ${JSON.stringify(stateToSave)}; window.addEventListener('DOMContentLoaded', function() { if (window.SAVED_STATE) { Object.assign(state, window.SAVED_STATE); state.charts = {}; document.getElementById('results').style.display = 'block'; initSelectors(); } });`;
        htmlContent.querySelector('head').appendChild(scriptTag);
        const blob = new Blob(['<!DOCTYPE html>\n' + htmlContent.outerHTML], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const now = new Date();
        a.download = `모의고사_분석결과_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.html`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) { alert('HTML 저장 중 오류가 발생했습니다: ' + e.message); }
}

/* ==============================
   PDF 생성
   ============================== */
async function captureTabPageV2(pdf, showSelectors, addNewPage) {
    const source = document.getElementById('individual-tab');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfPageHeight = pdf.internal.pageSize.getHeight();
    const marginX = 8, marginY = 8;
    const contentWidth = pdfWidth - marginX * 2;
    const cloneWidth = 1100;

    const canvasMap = new Map();
    source.querySelectorAll('canvas').forEach(c => {
        if (!c.id) return;
        try { canvasMap.set(c.id, { dataUrl: c.toDataURL('image/png'), w: c.offsetWidth || c.getBoundingClientRect().width, h: c.offsetHeight || c.getBoundingClientRect().height }); } catch (e) {}
    });

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `position:fixed;top:-99999px;left:0;width:${cloneWidth}px;max-width:${cloneWidth}px;background:#FEFDFB;padding:20px 24px;box-sizing:border-box;display:block;overflow:visible;z-index:-9999;`;

    const allSubjects = ['kor', 'math', 'eng', 'hist', 'inq1', 'inq2'];

    if (showSelectors.includes('profile')) {
        const profileCard = source.querySelector('.student-profile-card');
        if (profileCard) { const pc = profileCard.cloneNode(true); pc.style.marginBottom = '16px'; wrapper.appendChild(pc); }
    }

    if (showSelectors.includes('charts')) {
        const chartsRow = source.querySelector('.charts-row');
        if (chartsRow) {
            const cr = chartsRow.cloneNode(true);
            cr.setAttribute('style', 'display:grid !important;grid-template-columns:3fr 2fr !important;gap:20px !important;margin-bottom:20px !important;width:100% !important;');
            cr.querySelectorAll('.chart-half').forEach(ch => { ch.style.overflow = 'visible'; ch.style.minHeight = '0'; ch.style.height = 'auto'; });
            cr.querySelectorAll('.chart-half .chart-container').forEach(cc => { cc.setAttribute('style', 'overflow:visible !important;height:auto !important;min-height:200px !important;width:100% !important;display:block !important;position:relative !important;'); });
            wrapper.appendChild(cr);
        }
    }

    allSubjects.forEach(subj => {
        if (!showSelectors.includes(subj)) return;
        const card = source.querySelector(`.subject-detail-card[data-subject="${subj}"]`);
        if (!card) return;
        const cc = card.cloneNode(true);
        cc.style.marginBottom = '16px';
        cc.querySelectorAll('.subject-detail-grid').forEach(grid => {
            grid.setAttribute('style', 'display:grid !important;grid-template-columns:1fr 1fr !important;gap:16px !important;align-items:start !important;width:100% !important;');
            grid.querySelectorAll('.chart-container').forEach(chartC => { chartC.setAttribute('style', 'height:auto !important;width:100% !important;position:relative !important;overflow:visible !important;'); });
            grid.querySelectorAll('.table-wrapper').forEach(tw => { tw.setAttribute('style', 'overflow-x:auto !important;max-height:none !important;width:100% !important;'); });
        });
        wrapper.appendChild(cc);
    });

    wrapper.querySelectorAll('canvas').forEach(cloneCanvas => {
        const snap = canvasMap.get(cloneCanvas.id);
        if (!snap) { cloneCanvas.style.display = 'none'; return; }
        const img = document.createElement('img');
        img.src = snap.dataUrl;
        const ar = snap.w > 0 && snap.h > 0 ? `${snap.w} / ${snap.h}` : 'auto';
        img.style.cssText = `display:block;width:100%;height:auto;aspect-ratio:${ar};object-fit:fill;`;
        cloneCanvas.parentNode.replaceChild(img, cloneCanvas);
    });

    document.body.appendChild(wrapper);
    await new Promise(r => setTimeout(r, 400));

    const canvas = await html2canvas(wrapper, { scale: 2, useCORS: true, backgroundColor: '#FEFDFB', windowWidth: cloneWidth + 60, logging: false, allowTaint: true });
    document.body.removeChild(wrapper);

    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const imgProps = pdf.getImageProperties(imgData);
    const imgHeight = (imgProps.height * contentWidth) / imgProps.width;

    if (addNewPage) pdf.addPage();

    const maxH = pdfPageHeight - marginY * 2;
    if (imgHeight > maxH) {
        const scale = maxH / imgHeight;
        const scaledW = contentWidth * scale;
        const xOff = marginX + (contentWidth - scaledW) / 2;
        pdf.addImage(imgData, 'JPEG', xOff, marginY, scaledW, maxH);
    } else {
        pdf.addImage(imgData, 'JPEG', marginX, marginY, contentWidth, imgHeight);
    }
}

async function generateStudentPDF() {
    const btn = document.getElementById('pdfStudentBtn');
    if (!btn || btn.disabled) return;
    const uid = document.getElementById('indivStudentSelect')?.value;
    if (!uid) return alert('학생을 선택해주세요.');

    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> PDF 생성 중...';

    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        await new Promise(r => setTimeout(r, 1000));
        await captureTabPageV2(pdf, ['profile', 'charts', 'kor', 'math', 'eng'], false);
        await captureTabPageV2(pdf, ['hist', 'inq1', 'inq2'], true);
        const studentName = document.getElementById('indivName').innerText;
        pdf.save(`모의고사_분석리포트_${studentName}.pdf`);
    } catch (error) { console.error('PDF 생성 오류:', error); alert('PDF 생성 중 오류가 발생했습니다.'); }
    finally { btn.disabled = false; btn.innerHTML = originalText; }
}

async function generateClassPDF() {
    const btn = document.getElementById('pdfClassBtn');
    if (!btn || btn.disabled) return;
    const classSelect = document.getElementById('indivClassSelect');
    if (!classSelect) return;
    const cls = parseInt(classSelect.value);
    const sel = document.getElementById('indivStudentSelect');
    const options = Array.from(sel.options);
    if (!options.length) return alert('해당 학급에 학생이 없습니다.');
    if (!confirm(`현재 선택된 ${cls}반 학생 ${options.length}명 전체 리포트를 PDF로 생성합니다.\n시간이 다소 소요될 수 있습니다. 진행하시겠습니까?`)) return;

    btn.disabled = true;
    const originalText = btn.innerHTML;

    try {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');
        for (let i = 0; i < options.length; i++) {
            btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> PDF 생성 중... (${i + 1}/${options.length})`;
            sel.value = options[i].value;
            renderIndividual();
            await new Promise(r => setTimeout(r, 1000));
            await captureTabPageV2(pdf, ['profile', 'charts', 'kor', 'math', 'eng'], i > 0);
            await captureTabPageV2(pdf, ['hist', 'inq1', 'inq2'], true);
        }
        pdf.save(`모의고사_분석리포트_${cls}반_전체.pdf`);
    } catch (error) { console.error('PDF 생성 오류:', error); alert('학급 PDF 생성 중 오류가 발생했습니다.'); }
    finally { btn.disabled = false; btn.innerHTML = originalText; }
}
