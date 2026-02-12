/**
 * 전주고 모의고사 성적분석 V13
 * script.js
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
    charts: {}
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

// DOM 로드 완료 후 초기화
document.addEventListener('DOMContentLoaded', function() {
    initializeEventListeners();
});

// 이벤트 리스너 초기화
function initializeEventListeners() {
    const fileInput = document.getElementById('fileInput');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const uploadSection = document.querySelector('.upload-section');
    const fileLabel = document.querySelector('.file-input-label');

    // 파일 선택 이벤트
    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            displayFileList(files);
            analyzeBtn.disabled = false;
        }
    });

    // 분석 버튼 클릭
    analyzeBtn.addEventListener('click', () => {
        analyzeFiles();
    });

    // 탭 전환
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            switchTab(e.target.closest('.tab-btn').dataset.tab);
        });
    });

    // 드래그 앤 드롭 지원
    if (uploadSection) {
        const prevent = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
        };

        const setDragState = (on) => {
            if (fileLabel) fileLabel.classList.toggle('dragover', on);
        };

        ['dragover', 'drop'].forEach(evt => {
            window.addEventListener(evt, prevent);
        });

        ['dragenter', 'dragover'].forEach(evt => {
            uploadSection.addEventListener(evt, (ev) => {
                prevent(ev);
                setDragState(true);
            });
        });

        ['dragleave', 'dragend'].forEach(evt => {
            uploadSection.addEventListener(evt, (ev) => {
                prevent(ev);
                setDragState(false);
            });
        });

        uploadSection.addEventListener('drop', (ev) => {
            prevent(ev);
            setDragState(false);
            const dropped = Array.from(ev.dataTransfer?.files || []);
            const files = dropped.filter(f => /\.(xlsx|xls|csv|xlsm)$/i.test(f.name));
            if (files.length > 0) {
                displayFileList(files);
                analyzeBtn.disabled = false;
                // 파일 input에 반영
                const dt = new DataTransfer();
                files.forEach(f => dt.items.add(f));
                fileInput.files = dt.files;
            }
        });
    }

    // 개인통계 셀렉트 이벤트
    document.getElementById('indivClassSelect')?.addEventListener('change', updateIndivList);
    document.getElementById('indivStudentSelect')?.addEventListener('change', renderIndividual);

    // 학급통계 셀렉트 이벤트
    document.getElementById('examSelectClass')?.addEventListener('change', renderClass);
    document.getElementById('classSelect')?.addEventListener('change', renderClass);

    // 전체통계 시험 선택 이벤트
    document.getElementById('examSelectTotal')?.addEventListener('change', renderOverall);
}

// 파일 목록 표시
function displayFileList(files) {
    const fileList = document.getElementById('fileList');
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

// 파일 분석
async function analyzeFiles() {
    const fileInput = document.getElementById('fileInput');
    const files = Array.from(fileInput.files);
    
    if (files.length === 0) {
        alert('파일을 선택해주세요.');
        return;
    }

    showLoading();

    try {
        const promises = files.map(file => new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const wb = XLSX.read(evt.target.result, { type: 'array' });
                    let targetSheetName = null;
                    
                    for (const name of wb.SheetNames) {
                        const ws = wb.Sheets[name];
                        const json = XLSX.utils.sheet_to_json(ws, { header: 1 });
                        for (let i = 0; i < Math.min(20, json.length); i++) {
                            const rowStr = (json[i] || []).join(' ');
                            if (rowStr.includes('이름') && (rowStr.includes('국어') || rowStr.includes('수학'))) {
                                targetSheetName = name;
                                break;
                            }
                        }
                        if (targetSheetName) break;
                    }
                    
                    if (!targetSheetName) targetSheetName = wb.SheetNames[0];
                    const jsonData = XLSX.utils.sheet_to_json(wb.Sheets[targetSheetName], { header: 1 });
                    resolve(parseExcel(jsonData, file.name));
                } catch (err) {
                    console.error(err);
                    resolve(null);
                }
            };
            reader.readAsArrayBuffer(file);
        }));

        const results = await Promise.all(promises);
        state.exams = results
            .filter(r => r && r.students.length > 0)
            .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true })); // 역순 정렬로 최신 데이터 먼저

        if (state.exams.length) {
            hideLoading();
            document.getElementById('uploadSection').style.display = 'none';
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

// 엑셀 파싱
function parseExcel(rows, fname) {
    let startRow = -1;
    for (let i = 0; i < rows.length; i++) {
        if (!rows[i]) continue;
        const rowStr = rows[i].map(c => String(c).replace(/\s/g, '')).join(',');
        if (rowStr.includes('이름') && rowStr.includes('번호')) {
            startRow = i;
            break;
        }
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

// 셀렉터 초기화
function initSelectors() {
    const opts = state.exams.map((e, i) => `<option value="${i}">${e.name}</option>`).join('');
    document.getElementById('examSelectTotal').innerHTML = opts;
    document.getElementById('examSelectClass').innerHTML = opts;

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

// 탭 전환
function switchTab(t) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    document.getElementById(t + '-tab').classList.add('active');
    document.querySelector(`.tab-btn[data-tab="${t}"]`).classList.add('active');

    if (t === 'overall' && state.charts.bubble) state.charts.bubble.resize();
}

// 로딩 표시
function showLoading() {
    document.getElementById('loading').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

// ===== 전체통계 =====
function renderOverall() {
    const examIdx = document.getElementById('examSelectTotal').value;
    const students = state.exams[examIdx].students;
    const metric = state.metric;

    // 버블 차트 데이터
    const bubbleData = [];
    const classes = [...new Set(students.map(s => s.info.class))].sort((a, b) => a - b);
    const maxClass = Math.max(...classes) || 12;

    classes.forEach(c => {
        const clsStudents = students.filter(s => s.info.class == c);
        clsStudents.sort((a, b) => b.totalRaw - a.totalRaw);
        const count = clsStudents.length;

        clsStudents.forEach((s, idx) => {
            const ratio = idx / (count - 1 || 1);
            const r = ratio < 0.5 ? Math.floor(255 * (ratio * 2)) : 255;
            const g = ratio < 0.5 ? 255 : Math.floor(255 * (2 - ratio * 2));

            let score = 0;
            if (metric === 'raw') score = s.totalRaw;
            else if (metric === 'std') score = s.totalStd;
            else score = s.totalPct;

            bubbleData.push({
                x: Number(c),
                y: score,
                r: 8,
                bg: `rgba(${r}, ${g}, 0, 0.8)`,
                name: s.info.name
            });
        });
    });

    // 버블 차트 렌더링
    if (state.charts.bubble) state.charts.bubble.destroy();
    state.charts.bubble = new Chart(document.getElementById('bubbleChart'), {
        type: 'bubble',
        data: {
            datasets: [{
                data: bubbleData,
                backgroundColor: bubbleData.map(d => d.bg),
                borderColor: 'transparent'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: { display: true, text: '학급' },
                    min: 0,
                    max: maxClass + 1,
                    ticks: {
                        stepSize: 1,
                        callback: function(value) {
                            return (value >= 1 && value <= maxClass && Number.isInteger(value)) ? value + "반" : "";
                        }
                    }
                },
                y: {
                    title: { display: true, text: metric === 'raw' ? '원점수 합' : (metric === 'std' ? '표준점수 합' : '백분위 합') }
                }
            },
            plugins: {
                legend: { display: false },
                datalabels: { display: false },
                tooltip: {
                    callbacks: {
                        label: (c) => `${c.raw.x}반 ${c.raw.name}: ${c.raw.y.toFixed(1)}`
                    }
                }
            }
        }
    });

    // 과목별 통계 카드
    const container = document.getElementById('combinedStatsContainer');
    container.innerHTML = '';

    subjects.forEach(sub => {
        // metric에 따른 점수 계산 (탐구1,2도 포함)
        const scores = students.map(s => {
            if (sub.k === 'eng' || sub.k === 'hist') {
                return s[sub.k].raw; // 영어, 한국사는 항상 원점수
            } else if (metric === 'raw') {
                return s[sub.k].raw || 0;
            } else if (metric === 'std') {
                return s[sub.k].std || 0;
            } else { // pct
                return s[sub.k].pct || 0;
            }
        }).filter(v => v > 0);
        
        const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '-';
        const max = scores.length ? Math.max(...scores).toFixed(1) : '-';
        const mean = parseFloat(avg);
        const std = scores.length ? Math.sqrt(scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / scores.length).toFixed(1) : '-';

        const counts = Array(9).fill(0);
        students.forEach(s => { if (s[sub.k].grd) counts[s[sub.k].grd - 1]++; });
        
        // 탐구 과목명 수집
        const subjectNames = sub.k.includes('inq') ? [...new Set(students.map(s => s[sub.k].name).filter(n => n && n !== '-'))].join(', ') : '';

        const card = document.createElement('div');
        card.className = 'subject-card';
        card.innerHTML = `
            <div class="subject-card-header">
                <div class="subject-title">
                    <h4>${sub.n}</h4>
                    ${subjectNames ? `<p class="subject-names">${subjectNames}</p>` : ''}
                </div>
                <span class="count-badge">응시 ${scores.length}명</span>
            </div>
            <div class="subject-stats">
                <div class="stat-item">
                    <div class="stat-label">평균</div>
                    <div class="stat-value-large">${avg}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">표준편차</div>
                    <div class="stat-value-large">${std}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">최고점</div>
                    <div class="stat-value-large">${max}</div>
                </div>
            </div>
            <div class="grade-distribution">
                ${counts.map((count, idx) => {
                    const percentage = scores.length ? ((count / scores.length) * 100).toFixed(1) : 0;
                    const gradeColors = ['#2D5A3D', '#4A7C59', '#4A6B8A', '#B8860B', '#C17F24', '#8B2942', '#A23D56', '#C9C1B4', '#E8E2D9'];
                    return `
                        <div class="grade-bar-item">
                            <div class="grade-label">${idx + 1}등급</div>
                            <div class="grade-bar-container">
                                <div class="grade-bar-fill" style="width: ${percentage}%; background-color: ${gradeColors[idx]};"></div>
                            </div>
                            <div class="grade-percentage">${percentage}%</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
        container.appendChild(card);
    });

    // 성적 일람표
    const tbody = document.getElementById('totalTableBody');
    tbody.innerHTML = '';
    const getVal = (s, k) => (k == 'eng' || k == 'hist') ? s[k].raw : (metric == 'raw' ? s[k].raw : (s[k][metric] || '-'));
    const getTot = (s) => metric === 'raw' ? s.totalRaw : (metric === 'std' ? s.totalStd.toFixed(1) : s.totalPct.toFixed(1));

    students.slice(0, 500).forEach(s => {
        const studentId = `${s.info.grade}${String(s.info.class).padStart(2, '0')}${String(s.info.no).padStart(2, '0')}`;
        tbody.innerHTML += `
            <tr>
                <td style="font-weight:bold;color:var(--primary);">${s.totalRank}</td>
                <td style="font-family:monospace;color:var(--text-muted);">${studentId}</td>
                <td style="font-weight:bold;">${s.info.name}</td>
                <td>${getVal(s, 'kor')}</td><td class="g-${s.kor.grd}">${s.kor.grd}</td>
                <td>${getVal(s, 'math')}</td><td class="g-${s.math.grd}">${s.math.grd}</td>
                <td>${getVal(s, 'eng')}</td><td class="g-${s.eng.grd}">${s.eng.grd}</td>
                <td>${getVal(s, 'hist')}</td><td class="g-${s.hist.grd}">${s.hist.grd}</td>
                <td>${getVal(s, 'inq1')}</td><td class="g-${s.inq1.grd}">${s.inq1.grd}</td>
                <td>${getVal(s, 'inq2')}</td><td class="g-${s.inq2.grd}">${s.inq2.grd}</td>
                <td class="total-col">${getTot(s)}</td>
            </tr>
        `;
    });
}

// 메트릭 변경
function changeMetric(m) {
    state.metric = m;
    document.querySelectorAll('#overall-tab .opt-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-' + m).classList.add('active');
    renderOverall();
}

// ===== 학급통계 =====
function renderClass() {
    const examIdx = document.getElementById('examSelectClass').value;
    const cls = parseInt(document.getElementById('classSelect').value);
    const metric = state.classMetric;

    let students = state.exams[examIdx].students.filter(s => s.info.class === cls);
    const getTot = (s) => metric === 'raw' ? s.totalRaw : (metric === 'std' ? s.totalStd.toFixed(1) : s.totalPct.toFixed(1));

    if (state.classSort === 'total') students.sort((a, b) => parseFloat(getTot(b)) - parseFloat(getTot(a)));
    else students.sort((a, b) => a.info.no - b.info.no);

    const tbody = document.getElementById('classTableBody');
    tbody.innerHTML = '';
    const getVal = (s, k) => (k == 'eng' || k == 'hist') ? s[k].raw : (metric == 'raw' ? s[k].raw : (s[k][metric] || '-'));

    students.forEach(s => {
        const rank = students.filter(st => parseFloat(getTot(st)) > parseFloat(getTot(s))).length + 1;
        let html = `<tr><td>${s.info.no}</td><td style="font-weight:bold;">${s.info.name}</td>`;
        ['kor', 'math', 'eng', 'hist', 'inq1', 'inq2'].forEach(k => {
            html += `<td>${getVal(s, k)}</td><td class="g-${s[k].grd}">${s[k].grd}</td>`;
        });
        html += `<td class="total-col">${getTot(s)}</td><td class="total-col">${rank}</td></tr>`;
        tbody.innerHTML += html;
    });
}

function changeClassMetric(m) {
    state.classMetric = m;
    document.querySelectorAll('#class-tab .opt-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-c-' + m).classList.add('active');
    renderClass();
}

function sortClass(t) {
    state.classSort = t;
    document.getElementById('btn-sort-total').classList.remove('active');
    document.getElementById('btn-sort-no').classList.remove('active');
    document.getElementById('btn-sort-' + t).classList.add('active');
    renderClass();
}

// ===== 개인통계 =====
function updateIndivList() {
    const cls = parseInt(document.getElementById('indivClassSelect').value);
    const latest = state.exams[0]; // 최신 데이터 (역순 정렬되어 있음)
    const list = latest.students.filter(s => s.info.class === cls).sort((a, b) => a.info.no - b.info.no);
    const sel = document.getElementById('indivStudentSelect');
    sel.innerHTML = list.map(s => `<option value="${s.uid}">${s.info.no}번 ${s.info.name}</option>`).join('');
    if (list.length > 0) renderIndividual();
}

function renderIndividual() {
    const uid = document.getElementById('indivStudentSelect').value;
    const history = [];
    // 역순으로 저장하여 오래된 것부터 최신 순으로
    for (let i = state.exams.length - 1; i >= 0; i--) {
        const ex = state.exams[i];
        const s = ex.students.find(st => st.uid === uid);
        if (s) history.push({ name: ex.name, data: s });
    }
    if (!history.length) return;

    const latest = history[history.length - 1]; // 배열의 마지막이 최신
    const latestData = latest.data;

    document.getElementById('indivName').innerText = latestData.info.name;
    document.getElementById('indivInfo').innerText = `${latestData.info.grade}학년 ${latestData.info.class}반 ${latestData.info.no}번`;
    document.getElementById('latestExamName').innerText = "최근 시험: " + latest.name;

    document.getElementById('indivTotalRaw').innerText = latestData.totalRaw;
    document.getElementById('indivTotalStd').innerText = latestData.totalStd.toFixed(1);
    document.getElementById('indivTotalPct').innerText = latestData.totalPct.toFixed(2);
    document.getElementById('indivRank').innerText = latestData.totalRank;

    // 총점 추이 차트
    drawChart('totalTrendChart', 'line', {
        labels: history.map(h => h.name),
        datasets: [{
            label: '총점(백분위합)',
            data: history.map(h => h.data.totalPct),
            borderColor: '#9333ea',
            backgroundColor: '#9333ea',
            tension: 0.3
        }]
    }, {
        scales: { y: { min: 0, title: { display: true, text: '백분위합' } } },
        plugins: { datalabels: { display: true, color: '#9333ea', align: 'top', formatter: (v) => v.toFixed(2) } }
    });

    // 과목별 상세
    const container = document.getElementById('subjectDetailContainer');
    container.innerHTML = '';

    subjects.forEach(sub => {
        const k = sub.k;
        const isAbs = (k === 'eng' || k === 'hist');
        let thead = `<tr><th class="indiv-detail-header">구분</th>`;
        history.forEach(h => thead += `<th class="indiv-detail-header">${h.name}</th>`);
        thead += `</tr>`;

        let trRaw = `<tr><td style="font-weight:600;color:var(--text-muted);">원점수</td>`;
        let trGrd = `<tr><td style="font-weight:600;color:var(--text-muted);">등급</td>`;
        let trPct = `<tr><td style="font-weight:600;color:var(--text-muted);">백분위</td>`;

        history.forEach(h => {
            const d = h.data[k];
            trRaw += `<td>${d.raw}</td>`;
            trGrd += `<td class="g-${d.grd}">${d.grd}</td>`;
            trPct += `<td>${d.pct || '-'}</td>`;
        });
        trRaw += `</tr>`; trGrd += `</tr>`; trPct += `</tr>`;

        const chartId = `chart-${k}-${uid.replace(/[^a-zA-Z0-9]/g, '')}`;
        const card = document.createElement('div');
        card.className = 'subject-detail-card';
        card.innerHTML = `
            <h4><span>${sub.n}</span><span class="subject-name-badge">${latestData[k].name || ''}</span></h4>
            <div class="subject-detail-grid">
                <div class="subject-detail-chart"><canvas id="${chartId}"></canvas></div>
                <div class="subject-detail-table">
                    <table class="data-table indiv-detail-table" style="font-size:0.8rem;">
                        <thead>${thead}</thead>
                        <tbody>${trGrd}${trRaw}${!isAbs ? trPct : ''}</tbody>
                    </table>
                </div>
            </div>
        `;
        container.appendChild(card);

        setTimeout(() => {
            const ctx = document.getElementById(chartId);
            if (!ctx) return;
            const yVals = history.map(h => isAbs ? h.data[k].grd : h.data[k].pct);
            const yMax = isAbs ? 9 : 120;

            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: history.map(h => h.name),
                    datasets: [{
                        label: isAbs ? '등급' : '백분위',
                        data: yVals,
                        borderColor: isAbs ? '#f59e0b' : '#3b82f6',
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
                            color: isAbs ? '#d97706' : '#2563eb',
                            align: 'top',
                            formatter: (v) => v > 100 ? '' : v
                        }
                    },
                    scales: {
                        y: {
                            reverse: isAbs,
                            min: 0,
                            max: yMax,
                            ticks: {
                                stepSize: isAbs ? 1 : 20,
                                callback: function(val) { return val > 100 ? '' : val; }
                            }
                        }
                    }
                }
            });
        }, 0);
    });
}

// 차트 그리기 헬퍼
function drawChart(id, type, data, options) {
    if (state.charts[id]) state.charts[id].destroy();
    const ctx = document.getElementById(id).getContext('2d');
    state.charts[id] = new Chart(ctx, { type, data, options });
}

// Last updated 시간 업데이트
function updateLastUpdated() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    
    const timeString = `${year}-${month}-${day} ${hours}:${minutes} (KST)`;
    document.getElementById('lastUpdated').textContent = `Last updated: ${timeString}`;
}

// HTML 저장 기능
document.getElementById('saveHtmlBtn')?.addEventListener('click', function() {
    // 현재 페이지의 HTML을 복제
    const htmlContent = document.documentElement.cloneNode(true);
    
    // 업로드 섹션 제거
    const uploadSection = htmlContent.querySelector('#uploadSection');
    if (uploadSection) uploadSection.remove();
    
    // 로딩 오버레이 제거
    const loading = htmlContent.querySelector('#loading');
    if (loading) loading.remove();
    
    // results 섹션을 항상 표시
    const results = htmlContent.querySelector('#results');
    if (results) results.style.display = 'block';
    
    // HTML 저장 버튼 숨기기
    const saveBtn = htmlContent.querySelector('#saveHtmlBtn');
    if (saveBtn) saveBtn.style.display = 'none';
    
    // 완성된 HTML 생성
    const doctype = '<!DOCTYPE html>\n';
    const htmlString = doctype + htmlContent.outerHTML;
    
    // Blob 생성 및 다운로드
    const blob = new Blob([htmlString], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // 파일명 생성 (현재 날짜 포함)
    const now = new Date();
    const filename = `모의고사_분석결과_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.html`;
    a.download = filename;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    alert('분석결과 HTML이 저장되었습니다.');
});

