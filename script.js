/**
 * 전주고 모의고사 성적분석 V13
 * script.js (PDF 레이더 차트 잘림 및 과목 상세 겹침 수정본)
 */

// Chart.js 플러그인 등록
Chart.register(ChartDataLabels);
Chart.defaults.plugins.datalabels.display = false;

// 전역 상태
const state = {
    exams: [],
    metric: 'raw',
    classMetric: 'raw',
    classSort: 'no',
    charts: {},
    subjectCharts: []
};

// 과목 정의
const subjects = [
    { k: 'kor', n: '국어' },
    { k: 'math', n: '수학' },
    { k: 'eng', n: '영어' },
    { k: 'hist', n: '한국사' },
    { k: 'inq1', n: '탐구1' },
    { k: 'inq2', n: '탐구2' }
];

// 레이더 차트용 과목 색상
const radarColors = {
    kor: '#e74c3c',
    math: '#3498db',
    eng: '#2ecc71',
    soc: '#f39c12',
    sci: '#9b59b6'
};

document.addEventListener('DOMContentLoaded', function () {
    initializeEventListeners();
});

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
                if (chart && !chart.destroyed && typeof chart.resize === 'function') {
                    chart.resize();
                }
            });
        }, 150);
    });

    const saveHtmlBtn = document.getElementById('saveHtmlBtn');
    if (saveHtmlBtn) {
        saveHtmlBtn.replaceWith(saveHtmlBtn.cloneNode(true));
        document.getElementById('saveHtmlBtn').addEventListener('click', saveHtmlFile);
    }
}

function displayFileList(files) {
    const fileList = document.getElementById('fileList');
    if (!fileList) return;
    fileList.innerHTML = '<h4><i class="fas fa-file-alt"></i> 선택된 파일:</h4>';
    const ul = document.createElement('ul');
    files.forEach(file => {
        const li = document.createElement('li');
        li.textContent = file.name;
        ul.appendChild(li);
    });
    fileList.appendChild(ul);
    fileList.style.display = 'block';
}

function showLoading(text = '분석 중...') {
    const loadingText = document.getElementById('loadingText');
    if (loadingText) loadingText.textContent = text;
    document.getElementById('loading').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

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
                } catch (err) {
                    console.error(err); resolve(null);
                }
            };
            reader.readAsArrayBuffer(file);
        }));

        const results = await Promise.all(promises);
        state.exams = results
            .filter(r => r && r.students.length > 0)
            .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));

        if (state.exams.length) {
            hideLoading();
            document.getElementById('results').style.display = 'block';
            document.getElementById('saveHtmlBtn').style.display = 'inline-flex';
            updateLastUpdated();
            initSelectors();
        } else {
            hideLoading();
            alert('데이터를 찾을 수 없습니다.');
        }
    } catch (error) {
        hideLoading();
        alert('파일 분석 중 오류가 발생했습니다: ' + error.message);
    }
}

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
    const str = (r, i) => r[i] || '-';

    for (let i = startRow + 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r[4]) continue;

        const s = {
            info: { grade: parseInt(r[1]), class: parseInt(r[2]), no: parseInt(r[3]), name: r[4] },
            hist: { raw: val(r, 5), grd: grd(r, 6), std: 0, pct: 0 },
            kor: { raw: val(r, 8), std: val(r, 9), pct: val(r, 10), grd: grd(r, 11) },
            math: { raw: val(r, 13), std: val(r, 14), pct: val(r, 15), grd: grd(r, 16) },
            eng: { raw: val(r, 17), grd: grd(r, 18), std: 0, pct: 0 },
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
    if (!state.exams.length) return;
    const opts = state.exams.map((e, i) => `<option value="${i}">${e.name}</option>`).join('');
    document.getElementById('examSelectTotal').innerHTML = opts;
    document.getElementById('examSelectClass').innerHTML = opts;
    document.getElementById('indivExamSelect').innerHTML = opts;

    const classes = [...new Set(state.exams[0].students.map(s => s.info.class))].sort((a, b) => a - b);
    const cOpts = classes.map(c => `<option value="${c}">${c}반</option>`).join('');

    document.getElementById('classSelect').innerHTML = cOpts;
    document.getElementById('indivClassSelect').innerHTML = cOpts;
    document.getElementById('classSelect').value = classes[0];
    document.getElementById('indivClassSelect').value = classes[0];

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

// ===== 전체통계 =====
window.changeMetric = function (m) {
    state.metric = m;
    document.querySelectorAll('#overall-tab .opt-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-' + m).classList.add('active');
    renderOverall();
};

function renderOverall() {
    const examSelect = document.getElementById('examSelectTotal');
    if (!examSelect || !state.exams.length) return;
    const students = state.exams[examSelect.value].students;
    const metric = state.metric;

    const bubbleData = [];
    const classes = [...new Set(students.map(s => s.info.class))].sort((a, b) => a - b);
    const maxClass = Math.max(...classes) || 12;

    classes.forEach(c => {
        const clsStudents = students.filter(s => s.info.class == c).sort((a, b) => b.totalRaw - a.totalRaw);
        clsStudents.forEach((s, idx) => {
            const ratio = idx / (clsStudents.length - 1 || 1);
            const r = ratio < 0.5 ? Math.floor(255 * (ratio * 2)) : 255;
            const g = ratio < 0.5 ? 255 : Math.floor(255 * (2 - ratio * 2));
            let score = metric === 'raw' ? s.totalRaw : (metric === 'std' ? s.totalStd : s.totalPct);
            bubbleData.push({ x: Number(c), y: score, r: 8, bg: `rgba(${r}, ${g}, 0, 0.8)`, name: s.info.name });
        });
    });

    if (state.charts.bubble) state.charts.bubble.destroy();
    state.charts.bubble = new Chart(document.getElementById('bubbleChart'), {
        type: 'bubble',
        data: { datasets: [{ data: bubbleData, backgroundColor: bubbleData.map(d => d.bg), borderColor: 'transparent' }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { min: 0, max: maxClass + 1, ticks: { stepSize: 1, callback: v => (Number.isInteger(v) && v > 0 && v <= maxClass) ? v + "반" : "" } },
                y: { title: { display: true, text: metric === 'raw' ? '원점수 합' : (metric === 'std' ? '표준점수 합' : '백분위 합') } }
            },
            plugins: { legend: { display: false }, datalabels: { display: false }, tooltip: { callbacks: { label: c => `${c.raw.x}반 ${c.raw.name}: ${c.raw.y.toFixed(1)}` } } }
        }
    });

    const container = document.getElementById('combinedStatsContainer');
    container.innerHTML = '';
    subjects.forEach(sub => {
        const scores = students.map(s => (sub.k === 'eng' || sub.k === 'hist') ? s[sub.k].raw : (s[sub.k][metric] || 0)).filter(v => v > 0);
        const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '-';
        const std = scores.length ? Math.sqrt(scores.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / scores.length).toFixed(1) : '-';
        const counts = Array(9).fill(0);
        students.forEach(s => { if (s[sub.k].grd) counts[s[sub.k].grd - 1]++; });

        container.innerHTML += `
            <div class="subject-card">
                <div class="subject-card-header">
                    <h4>${sub.n}</h4>
                    <span class="count-badge">응시 ${scores.length}명</span>
                </div>
                <div class="subject-stats">
                    <div class="stat-item"><div class="stat-label">평균</div><div class="stat-value-large">${avg}</div></div>
                    <div class="stat-item"><div class="stat-label">표준편차</div><div class="stat-value-large">${std}</div></div>
                    <div class="stat-item"><div class="stat-label">최고점</div><div class="stat-value-large">${scores.length ? Math.max(...scores).toFixed(1) : '-'}</div></div>
                </div>
                <div class="grade-distribution">
                    ${counts.map((c, i) => {
            const pct = scores.length ? ((c / scores.length) * 100).toFixed(1) : 0;
            return `
                        <div class="grade-bar-item">
                            <div class="grade-label">${i + 1}등급</div>
                            <div class="grade-bar-container"><div class="grade-bar-fill g-${i + 1}" style="width: ${pct}%;"></div></div>
                            <div class="grade-count">${c}명</div>
                            <div class="grade-percentage">${pct}%</div>
                        </div>`;
        }).join('')}
                </div>
            </div>`;
    });

    const tbody = document.getElementById('totalTableBody');
    tbody.innerHTML = '';
    const getTot = s => metric === 'raw' ? s.totalRaw : (metric === 'std' ? s.totalStd.toFixed(1) : s.totalPct.toFixed(1));
    students.slice(0, 500).forEach(s => {
        tbody.innerHTML += `
            <tr>
                <td style="font-weight:bold;color:var(--primary);">${s.totalRank}</td>
                <td>${s.info.grade}${String(s.info.class).padStart(2, '0')}${String(s.info.no).padStart(2, '0')}</td>
                <td style="font-weight:bold;">${s.info.name}</td>
                ${['kor', 'math', 'eng', 'hist', 'inq1', 'inq2'].map(k => `<td>${(k == 'eng' || k == 'hist') ? s[k].raw : (s[k][metric] || '-')}</td><td class="g-${s[k].grd}">${s[k].grd}</td>`).join('')}
                <td class="total-col">${getTot(s)}</td>
            </tr>`;
    });
}

// ===== 학급통계 =====
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
    const examSelect = document.getElementById('examSelectClass');
    const classSelect = document.getElementById('classSelect');
    if (!examSelect || !classSelect || !state.exams.length) return;

    const studentsAll = state.exams[examSelect.value].students;
    const cls = parseInt(classSelect.value);
    const metric = state.classMetric;

    let students = studentsAll.filter(s => s.info.class === cls);
    const getTot = s => metric === 'raw' ? s.totalRaw : (metric === 'std' ? s.totalStd.toFixed(1) : s.totalPct.toFixed(1));
    if (state.classSort === 'total') students.sort((a, b) => parseFloat(getTot(b)) - parseFloat(getTot(a)));
    else students.sort((a, b) => a.info.no - b.info.no);

    const container = document.getElementById('classStatsContainer');
    if (container) {
        container.innerHTML = '';
        subjects.forEach(sub => {
            const scores = students.map(s => (sub.k === 'eng' || sub.k === 'hist') ? s[sub.k].raw : (s[sub.k][metric] || 0)).filter(v => v > 0);
            const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '-';
            const std = scores.length ? Math.sqrt(scores.reduce((a, b) => a + Math.pow(b - parseFloat(avg), 2), 0) / scores.length).toFixed(1) : '-';
            const counts = Array(9).fill(0);
            students.forEach(s => { if (s[sub.k].grd) counts[s[sub.k].grd - 1]++; });

            container.innerHTML += `
                <div class="subject-card">
                    <div class="subject-card-header">
                        <h4>${sub.n}</h4>
                        <span class="count-badge">응시 ${scores.length}명</span>
                    </div>
                    <div class="subject-stats">
                        <div class="stat-item"><div class="stat-label">평균</div><div class="stat-value-large">${avg}</div></div>
                        <div class="stat-item"><div class="stat-label">표준편차</div><div class="stat-value-large">${std}</div></div>
                        <div class="stat-item"><div class="stat-label">최고점</div><div class="stat-value-large">${scores.length ? Math.max(...scores).toFixed(1) : '-'}</div></div>
                    </div>
                    <div class="grade-distribution">
                        ${counts.map((c, i) => {
                const pct = scores.length ? ((c / scores.length) * 100).toFixed(1) : 0;
                return `
                            <div class="grade-bar-item">
                                <div class="grade-label">${i + 1}등급</div>
                                <div class="grade-bar-container"><div class="grade-bar-fill g-${i + 1}" style="width: ${pct}%;"></div></div>
                                <div class="grade-count">${c}명</div>
                                <div class="grade-percentage">${pct}%</div>
                            </div>`;
            }).join('')}
                    </div>
                </div>`;
        });
    }

    const tbody = document.getElementById('classTableBody');
    if (tbody) {
        tbody.innerHTML = '';
        students.forEach(s => {
            const rank = students.filter(st => parseFloat(getTot(st)) > parseFloat(getTot(s))).length + 1;
            let html = `<tr><td>${s.info.no}</td><td style="font-weight:bold;">${s.info.name}</td>`;
            ['kor', 'math', 'eng', 'hist', 'inq1', 'inq2'].forEach(k => { html += `<td>${(k == 'eng' || k == 'hist') ? s[k].raw : (s[k][metric] || '-')}</td><td class="g-${s[k].grd}">${s[k].grd}</td>`; });
            html += `<td class="total-col">${getTot(s)}</td><td class="total-col">${rank}</td></tr>`;
            tbody.innerHTML += html;
        });
    }
}

// ===== 개인통계 =====
function updateIndivList() {
    const cls = parseInt(document.getElementById('indivClassSelect').value);
    const list = state.exams[0].students.filter(s => s.info.class === cls).sort((a, b) => a.info.no - b.info.no);
    document.getElementById('indivStudentSelect').innerHTML = list.map(s => `<option value="${s.uid}">${s.info.no}번 ${s.info.name}</option>`).join('');
    if (list.length > 0) renderIndividual();
}

function renderIndividual() {
    const sel = document.getElementById('indivStudentSelect');
    if (!sel || !sel.value) return;

    const uid = sel.value;
    const history = [];
    for (let i = state.exams.length - 1; i >= 0; i--) {
        const ex = state.exams[i];
        const s = ex.students.find(st => st.uid === uid);
        if (s) history.push({ name: ex.name, data: s });
    }
    if (!history.length) return;

    const selectedExamIdx = document.getElementById('indivExamSelect')?.value || 0;
    let currentData = state.exams[selectedExamIdx]?.students.find(st => st.uid === uid);
    let selectedExamName = state.exams[selectedExamIdx]?.name;

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
    document.getElementById('indivAverageGrade').innerText = `${avgGrade}`;

    // 총점 추이 차트
    drawChart('totalTrendChart', 'line', {
        labels: history.map(h => h.name),
        datasets: [{
            label: '총점(백분위합)',
            data: history.map(h => h.data.totalPct),
            borderColor: '#8B5A8D',
            backgroundColor: '#8B5A8D',
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 4
        }]
    }, {
        scales: { y: { min: 0 } },
        plugins: {
            datalabels: {
                display: true,
                color: '#8B5A8D',
                align: 'top',
                font: { weight: 'bold' },
                formatter: v => v.toFixed(1)
            }
        }
    });

    // 오각형 레이더 차트
    const radarLabels = ['국어', '수학', '영어', '사회', '과학'];
    const radarPointColors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6'];

    const radarGrades = [
        currentData.kor.grd,
        currentData.math.grd,
        currentData.eng.grd,
        currentData.inq1.grd,
        currentData.inq2.grd
    ];

    const radarData = {
        labels: radarLabels,
        datasets: [{
            label: '등급',
            data: radarGrades,
            backgroundColor: 'rgba(100, 150, 200, 0.2)',
            borderColor: 'rgba(100, 150, 200, 0.6)',
            borderWidth: 2,
            pointBackgroundColor: radarPointColors,
            pointBorderColor: radarPointColors,
            pointBorderWidth: 2,
            pointRadius: 6,
            pointHoverRadius: 8
        }]
    };

    drawChart('radarChart', 'radar', radarData, {
        layout: {
            padding: {
                top: 30,
                bottom: 30,
                left: 50,
                right: 50
            }
        },
        scales: {
            r: {
                reverse: true,
                min: 1,
                max: 9,
                ticks: {
                    stepSize: 1,
                    display: true,
                    font: { size: 10 },
                    color: '#999',
                    backdropColor: 'transparent'
                },
                grid: {
                    circular: false,
                    color: 'rgba(0, 0, 0, 0.1)'
                },
                angleLines: {
                    display: true,
                    color: 'rgba(0, 0, 0, 0.1)'
                },
                pointLabels: {
                    font: {
                        size: 13,
                        weight: 'bold',
                        family: "'Pretendard', sans-serif"
                    },
                    color: radarPointColors,
                    padding: 12
                }
            }
        },
        plugins: {
            legend: { display: false },
            datalabels: {
                display: true,
                backgroundColor: function (context) {
                    const v = context.dataset.data[context.dataIndex];
                    return v <= 1.5 ? 'rgba(255,255,255,0.85)' : '#ffffff';
                },
                borderColor: function (context) {
                    return radarPointColors[context.dataIndex];
                },
                borderWidth: 2,
                color: function (context) {
                    return radarPointColors[context.dataIndex];
                },
                borderRadius: 4,
                padding: { top: 3, bottom: 3, left: 6, right: 6 },
                font: { weight: 'bold', size: 10 },
                formatter: (v) => v.toFixed(2) + '등급',
                anchor: 'center',
                align: function (context) {
                    const idx = context.dataIndex;
                    const count = context.dataset.data.length;
                    const angleDeg = 90 - (360 / count) * idx;
                    const angleRad = angleDeg * Math.PI / 180;
                    return angleRad + Math.PI;
                },
                offset: function (context) {
                    const v = context.dataset.data[context.dataIndex];
                    const normalized = (v - 1) / 8;
                    return Math.round(4 + (1 - normalized) * 10);
                },
                clip: false
            }
        }
    });

    // 과목별 상세
    const container = document.getElementById('subjectDetailContainer');
    if (container) {
        state.subjectCharts.forEach(c => { try { c.destroy(); } catch (e) { } });
        state.subjectCharts = [];
        container.innerHTML = '';
        subjects.forEach(sub => {
            const k = sub.k;
            const isAbs = (k === 'eng' || k === 'hist');

            let displayTitle = sub.n;
            if ((k === 'inq1' || k === 'inq2') && currentData[k].name && currentData[k].name !== '-') {
                displayTitle = `${sub.n} (${currentData[k].name})`;
            }

            let thead = `<tr><th>구분</th>` + history.map(h => `<th>${h.name}</th>`).join('') + `</tr>`;
            let trRaw = `<tr><td>원점수</td>` + history.map(h => `<td>${h.data[k].raw}</td>`).join('') + `</tr>`;
            let trStd = `<tr><td>표준점수</td>` + history.map(h => `<td>${h.data[k].std || '-'}</td>`).join('') + `</tr>`;
            let trGrd = `<tr><td>등급</td>` + history.map(h => `<td class="g-${h.data[k].grd}">${h.data[k].grd}</td>`).join('') + `</tr>`;
            let trPct = `<tr><td>백분위</td>` + history.map(h => `<td>${h.data[k].pct || '-'}</td>`).join('') + `</tr>`;

            const chartId = `chart-${k}-${uid.replace(/[^a-zA-Z0-9]/g, '')}`;

            container.innerHTML += `
                <div class="chart-card subject-detail-card" data-subject="${k}">
                    <h3><i class="fas fa-book"></i> ${displayTitle} 성적 상세</h3>
                    <div class="subject-detail-grid">
                        <div class="chart-container" style="height: 200px; width: 100%;"><canvas id="${chartId}"></canvas></div>
                        <div class="table-wrapper">
                            <table class="data-table" style="font-size:0.8rem; min-width: 100%;">
                                <thead>${thead}</thead>
                                <tbody>${trGrd}${trRaw}${!isAbs ? trStd : ''}${!isAbs ? trPct : ''}</tbody>
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
                        datasets: [{
                            label: isAbs ? '등급' : '백분위',
                            data: yVals,
                            borderColor: isAbs ? '#B8860B' : '#4A6B8A',
                            tension: 0.1,
                            borderWidth: 2,
                            pointRadius: 4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            datalabels: {
                                display: true,
                                color: isAbs ? '#B8860B' : '#4A6B8A',
                                align: 'top',
                                font: { weight: 'bold' },
                                formatter: v => v > 100 ? '' : v
                            }
                        },
                        scales: {
                            y: {
                                reverse: isAbs,
                                min: isAbs ? 0 : 0,
                                max: isAbs ? 9 : 120,
                                ticks: {
                                    stepSize: isAbs ? 1 : 20,
                                    callback: function (value) {
                                        if (isAbs && value === 0) return '';
                                        return value;
                                    }
                                }
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

// ===== HTML 저장 =====
window.saveHtmlFile = function () {
    try {
        const htmlContent = document.documentElement.cloneNode(true);
        htmlContent.querySelector('#uploadSection')?.remove();
        htmlContent.querySelector('#loading')?.remove();
        htmlContent.querySelector('#saveHtmlBtn')?.remove();

        const stateToSave = {
            exams: state.exams,
            metric: state.metric,
            classMetric: state.classMetric,
            classSort: state.classSort,
            charts: {}
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
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        alert('HTML 저장 중 오류가 발생했습니다: ' + e.message);
    }
}

// ============================================================
// ===== PDF 생성 (전면 수정 - 잘림/겹침 해결) =====
// ============================================================

/**
 * 지정된 요소들만 모아 임시 컨테이너를 만들어 캡처한 뒤 PDF 페이지에 삽입합니다.
 * 각 섹션을 개별 복제하여 조립하므로 원본 레이아웃을 정확히 보존합니다.
 *
 * @param {jsPDF} pdf - jsPDF 인스턴스
 * @param {string[]} showSelectors - 이 페이지에 포함할 섹션: 'profile', 'charts', 또는 과목키('kor','math',...)
 * @param {boolean} addNewPage - true면 캡처 전에 새 페이지를 추가
 */
async function captureTabPageV2(pdf, showSelectors, addNewPage) {
    const source = document.getElementById('individual-tab');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfPageHeight = pdf.internal.pageSize.getHeight();
    const marginX = 8;
    const marginY = 8;
    const contentWidth = pdfWidth - marginX * 2;
    const cloneWidth = 1100;

    // ── 1. 원본 canvas 스냅샷을 ID 기반으로 수집 ──
    const canvasMap = new Map();
    source.querySelectorAll('canvas').forEach(c => {
        if (!c.id) return;
        try {
            canvasMap.set(c.id, {
                dataUrl: c.toDataURL('image/png'),
                w: c.offsetWidth || c.getBoundingClientRect().width,
                h: c.offsetHeight || c.getBoundingClientRect().height,
            });
        } catch (e) { /* cross-origin 등 무시 */ }
    });

    // ── 2. 임시 wrapper 생성 ──
    const wrapper = document.createElement('div');
    wrapper.style.cssText = [
        'position:fixed',
        'top:-99999px',
        'left:0',
        `width:${cloneWidth}px`,
        `max-width:${cloneWidth}px`,
        'background:#FEFDFB',
        'padding:20px 24px',
        'box-sizing:border-box',
        'display:block',
        'overflow:visible',
        'z-index:-9999',
    ].join(';');

    const allSubjects = ['kor', 'math', 'eng', 'hist', 'inq1', 'inq2'];

    // ── 3. 필요한 섹션만 복제하여 wrapper에 추가 ──

    // 3-a. 프로필 카드
    if (showSelectors.includes('profile')) {
        const profileCard = source.querySelector('.student-profile-card');
        if (profileCard) {
            const pc = profileCard.cloneNode(true);
            pc.style.marginBottom = '16px';
            wrapper.appendChild(pc);
        }
    }

    // 3-b. 추이/레이더 차트 행
    if (showSelectors.includes('charts')) {
        const chartsRow = source.querySelector('.charts-row');
        if (chartsRow) {
            const cr = chartsRow.cloneNode(true);
            // 2열 그리드 강제
            cr.setAttribute('style', [
                'display:grid !important',
                'grid-template-columns:1fr 1fr !important',
                'gap:20px !important',
                'margin-bottom:20px !important',
                'width:100% !important',
            ].join(';'));

            // chart-half 오버플로우 허용 (레이더 라벨 잘림 방지)
            cr.querySelectorAll('.chart-half').forEach(ch => {
                ch.style.overflow = 'visible';
                ch.style.minHeight = '380px';
            });
            // chart-container에 충분한 공간 + 패딩
            cr.querySelectorAll('.chart-half .chart-container').forEach(cc => {
                cc.setAttribute('style', [
                    'overflow:visible !important',
                    'height:340px !important',
                    'width:100% !important',
                    'display:flex !important',
                    'justify-content:center !important',
                    'align-items:center !important',
                    'padding:10px !important',
                ].join(';'));
            });

            wrapper.appendChild(cr);
        }
    }

    // 3-c. 과목별 상세 카드
    allSubjects.forEach(subj => {
        if (!showSelectors.includes(subj)) return;
        const card = source.querySelector(`.subject-detail-card[data-subject="${subj}"]`);
        if (!card) return;

        const cc = card.cloneNode(true);
        cc.style.marginBottom = '16px';

        // subject-detail-grid 2열 강제 + 높이 확보
        cc.querySelectorAll('.subject-detail-grid').forEach(grid => {
            grid.setAttribute('style', [
                'display:grid !important',
                'grid-template-columns:1fr 1fr !important',
                'gap:16px !important',
                'align-items:start !important',
                'width:100% !important',
            ].join(';'));

            // 차트 컨테이너 높이 고정
            grid.querySelectorAll('.chart-container').forEach(chartC => {
                chartC.setAttribute('style',
                    'height:180px !important; width:100% !important; position:relative !important; overflow:visible !important;'
                );
            });
            // 테이블 래퍼
            grid.querySelectorAll('.table-wrapper').forEach(tw => {
                tw.setAttribute('style',
                    'overflow-x:auto !important; max-height:none !important; width:100% !important;'
                );
            });
        });

        wrapper.appendChild(cc);
    });

    // ── 4. wrapper 내 canvas → 스냅샷 img로 교체 ──
    wrapper.querySelectorAll('canvas').forEach(cloneCanvas => {
        const snap = canvasMap.get(cloneCanvas.id);
        if (!snap) {
            cloneCanvas.style.display = 'none';
            return;
        }
        const img = document.createElement('img');
        img.src = snap.dataUrl;

        const isRadar = cloneCanvas.id && cloneCanvas.id.includes('radar');
        const isTrend = cloneCanvas.id && cloneCanvas.id.includes('totalTrend');

        if (isRadar) {
            // 레이더: 고정 크기, 가운데 정렬, 주변 여백 확보
            img.style.cssText = [
                'display:block',
                'width:400px',
                'height:340px',
                'margin:0 auto',
                'object-fit:contain',
            ].join(';');
        } else if (isTrend) {
            img.style.cssText = 'display:block; width:100%; height:auto; max-height:300px; object-fit:contain;';
        } else {
            // 과목별 상세 차트
            img.style.cssText = `display:block; width:100%; height:auto; max-height:${snap.h}px; object-fit:contain;`;
        }

        cloneCanvas.parentNode.replaceChild(img, cloneCanvas);
    });

    // ── 5. DOM에 붙이고 html2canvas 캡처 ──
    document.body.appendChild(wrapper);
    await new Promise(r => setTimeout(r, 400));

    const canvas = await html2canvas(wrapper, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#FEFDFB',
        windowWidth: cloneWidth + 60,
        logging: false,
        allowTaint: true,
    });

    document.body.removeChild(wrapper);

    // ── 6. 캡처 이미지를 PDF 페이지에 삽입 ──
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const imgProps = pdf.getImageProperties(imgData);
    const imgHeight = (imgProps.height * contentWidth) / imgProps.width;

    if (addNewPage) pdf.addPage();

    const maxH = pdfPageHeight - marginY * 2;
    if (imgHeight > maxH) {
        // 한 페이지에 들어가도록 비율 유지 축소
        const scale = maxH / imgHeight;
        const scaledW = contentWidth * scale;
        const scaledH = maxH;
        const xOff = marginX + (contentWidth - scaledW) / 2;
        pdf.addImage(imgData, 'JPEG', xOff, marginY, scaledW, scaledH);
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

        // 차트 렌더링 안정화 대기
        await new Promise(r => setTimeout(r, 1000));

        // 1페이지: 프로필 + 추이/레이더 차트 + 국어, 수학, 영어 상세
        await captureTabPageV2(pdf, ['profile', 'charts', 'kor', 'math', 'eng'], false);

        // 2페이지: 한국사, 탐구1, 탐구2 상세
        await captureTabPageV2(pdf, ['hist', 'inq1', 'inq2'], true);

        const studentName = document.getElementById('indivName').innerText;
        pdf.save(`모의고사_분석리포트_${studentName}.pdf`);

    } catch (error) {
        console.error('PDF 생성 오류:', error);
        alert('PDF 생성 중 오류가 발생했습니다.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
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

            // 1페이지 (첫 학생 제외 새 페이지)
            await captureTabPageV2(pdf, ['profile', 'charts', 'kor', 'math', 'eng'], i > 0);

            // 2페이지
            await captureTabPageV2(pdf, ['hist', 'inq1', 'inq2'], true);
        }

        pdf.save(`모의고사_분석리포트_${cls}반_전체.pdf`);

    } catch (error) {
        console.error('PDF 생성 오류:', error);
        alert('학급 PDF 생성 중 오류가 발생했습니다.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}
