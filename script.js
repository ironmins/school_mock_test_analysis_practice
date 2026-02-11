// 전역 변수
let allData = [];
let currentStudents = [];
let charts = {};

// 엑셀 파일 읽기
document.getElementById('fileInput').addEventListener('change', handleFileSelect);

function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    
    if (files.length === 0) {
        alert('파일을 선택해주세요.');
        return;
    }

    // 파일 목록 표시
    displayFileList(files);
    
    // 모든 파일 읽기
    Promise.all(files.map(file => readExcelFile(file)))
        .then(dataArrays => {
            allData = dataArrays.flat();
            // 최신 데이터가 먼저 오도록 정렬 (파일명이나 날짜 기준)
            allData.reverse();
            
            document.getElementById('analyzeBtn').disabled = false;
            alert(`${files.length}개 파일이 업로드되었습니다. (총 ${allData.length}명의 데이터)`);
        })
        .catch(error => {
            console.error('파일 읽기 오류:', error);
            alert('파일 읽기에 실패했습니다.');
        });
}

function displayFileList(files) {
    const fileListDiv = document.getElementById('fileList');
    if (!fileListDiv) return;
    
    fileListDiv.innerHTML = '<h3>업로드된 파일:</h3>';
    
    // 최신 파일이 위에 오도록 역순으로 표시
    files.reverse().forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <span>${file.name}</span>
            <button onclick="removeFile(${files.length - 1 - index})">삭제</button>
        `;
        fileListDiv.appendChild(fileItem);
    });
}

function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                // DATA 시트 읽기
                const worksheet = workbook.Sheets['DATA'] || workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                
                // 데이터 파싱
                const parsedData = parseExcelData(jsonData, file.name);
                resolve(parsedData);
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function parseExcelData(rawData, fileName) {
    const students = [];
    
    // 헤더 행 찾기
    const headers = rawData[0];
    const subHeaders = rawData[1];
    
    // 3행부터 학생 데이터
    for (let i = 2; i < rawData.length; i++) {
        const row = rawData[i];
        
        if (!row || row.length < 4) continue;
        
        const student = {
            fileName: fileName,
            grade: row[0],
            class: row[1],
            number: row[2],
            name: row[3],
            subjects: {}
        };
        
        // 과목별 점수 파싱
        let colIndex = 4;
        const subjectNames = ['국어', '수학', '영어', '탐구1', '탐구2', '탐구3', '제2외국어'];
        
        subjectNames.forEach(subject => {
            if (colIndex < row.length) {
                student.subjects[subject] = {
                    raw: row[colIndex] || 0,
                    standard: row[colIndex + 1] || 0,
                    percentile: row[colIndex + 2] || 0,
                    grade: row[colIndex + 3] || 0
                };
                colIndex += 4;
            }
        });
        
        // 총점
        student.total = row[colIndex] || 0;
        
        students.push(student);
    }
    
    return students;
}

// 분석 시작
document.getElementById('analyzeBtn').addEventListener('click', function() {
    if (allData.length === 0) {
        alert('먼저 파일을 업로드해주세요.');
        return;
    }
    
    showLoading(true);
    
    setTimeout(() => {
        analyzeAllData();
        showLoading(false);
        document.getElementById('results').style.display = 'block';
    }, 500);
});

function showLoading(show) {
    const loading = document.querySelector('.loading');
    if (loading) {
        loading.classList.toggle('active', show);
    }
}

function analyzeAllData() {
    // 최신 데이터 순으로 분석
    displayOverallStats();
    displaySubjectAnalysis();
    displayClassAnalysis();
    setupStudentSelector();
}

// 전체 통계 표시
function displayOverallStats() {
    const statsDiv = document.getElementById('overallStats');
    
    const totalStudents = allData.length;
    const avgPercentile = calculateAverage(allData.map(s => getAveragePercentile(s)));
    const avgStandard = calculateAverage(allData.map(s => getAverageStandard(s)));
    const avgRaw = calculateAverage(allData.map(s => getAverageRaw(s)));
    
    statsDiv.innerHTML = `
        <div class="stats-grid">
            <div class="stat-card">
                <h3>전체 학생 수</h3>
                <div class="value">${totalStudents}</div>
                <div class="label">명</div>
            </div>
            <div class="stat-card">
                <h3>평균 백분위</h3>
                <div class="value">${avgPercentile.toFixed(1)}</div>
                <div class="label">%</div>
            </div>
            <div class="stat-card">
                <h3>평균 표준점수</h3>
                <div class="value">${avgStandard.toFixed(1)}</div>
                <div class="label">점</div>
            </div>
            <div class="stat-card">
                <h3>평균 원점수</h3>
                <div class="value">${avgRaw.toFixed(1)}</div>
                <div class="label">점</div>
            </div>
        </div>
        
        <div class="analysis-section">
            <h3>학급별 백분위 분포</h3>
            <div class="chart-container">
                <canvas id="classPercentileChart"></canvas>
            </div>
        </div>
        
        <div class="analysis-section">
            <h3>영역별 평균 등급</h3>
            <div class="chart-container">
                <canvas id="subjectGradeChart"></canvas>
            </div>
        </div>
    `;
    
    // 차트 생성 (최신 데이터 순)
    createClassPercentileChart();
    createSubjectGradeChart();
}

// 과목별 분석
function displaySubjectAnalysis() {
    const subjectDiv = document.getElementById('subjectAnalysis');
    
    subjectDiv.innerHTML = `
        <div class="analysis-section">
            <h3>과목별 평균 점수 비교</h3>
            <div class="chart-container">
                <canvas id="subjectComparisonChart"></canvas>
            </div>
        </div>
        
        <div class="analysis-section">
            <h3>과목별 상세 통계</h3>
            <div id="subjectDetailTable"></div>
        </div>
    `;
    
    createSubjectComparisonChart();
    createSubjectDetailTable();
}

// 학급별 분석
function displayClassAnalysis() {
    const classDiv = document.getElementById('classAnalysis');
    
    classDiv.innerHTML = `
        <div class="analysis-section">
            <h3>학급별 평균 비교</h3>
            <div class="chart-container">
                <canvas id="classComparisonChart"></canvas>
            </div>
        </div>
        
        <div class="analysis-section">
            <h3>학급별 상세 통계</h3>
            <div id="classDetailTable"></div>
        </div>
    `;
    
    createClassComparisonChart();
    createClassDetailTable();
}

// 학생 선택기 설정
function setupStudentSelector() {
    const grades = [...new Set(allData.map(s => s.grade))].sort().reverse(); // 최신 학년 순
    const gradeSelect = document.getElementById('gradeSelect');
    
    gradeSelect.innerHTML = '<option value="all">전체</option>';
    grades.forEach(grade => {
        gradeSelect.innerHTML += `<option value="${grade}">${grade}학년</option>`;
    });
    
    gradeSelect.addEventListener('change', updateClassSelect);
    document.getElementById('classSelect').addEventListener('change', updateNumberSelect);
    document.getElementById('numberSelect').addEventListener('change', updateStudentName);
}

function updateClassSelect() {
    const grade = document.getElementById('gradeSelect').value;
    let filteredData = allData;
    
    if (grade !== 'all') {
        filteredData = allData.filter(s => s.grade == grade);
    }
    
    const classes = [...new Set(filteredData.map(s => s.class))].sort().reverse(); // 최신 반 순
    const classSelect = document.getElementById('classSelect');
    
    classSelect.innerHTML = '<option value="all">전체</option>';
    classes.forEach(cls => {
        classSelect.innerHTML += `<option value="${cls}">${cls}반</option>`;
    });
    
    updateNumberSelect();
}

function updateNumberSelect() {
    const grade = document.getElementById('gradeSelect').value;
    const cls = document.getElementById('classSelect').value;
    
    let filteredData = allData;
    
    if (grade !== 'all') {
        filteredData = filteredData.filter(s => s.grade == grade);
    }
    
    if (cls !== 'all') {
        filteredData = filteredData.filter(s => s.class == cls);
    }
    
    // 최신 데이터 순으로 정렬
    filteredData.sort((a, b) => {
        if (a.fileName !== b.fileName) {
            return b.fileName.localeCompare(a.fileName);
        }
        return b.number - a.number;
    });
    
    const numberSelect = document.getElementById('numberSelect');
    numberSelect.innerHTML = '<option value="all">학생 선택</option>';
    
    filteredData.forEach((student, index) => {
        numberSelect.innerHTML += `<option value="${index}">${student.number}번</option>`;
    });
    
    currentStudents = filteredData;
    updateStudentName();
}

function updateStudentName() {
    const numberSelect = document.getElementById('numberSelect');
    const nameSpan = document.getElementById('studentName');
    const index = numberSelect.value;
    
    if (index === 'all' || !currentStudents[index]) {
        nameSpan.textContent = '';
        document.getElementById('analyzeStudentBtn').disabled = true;
        return;
    }
    
    nameSpan.textContent = currentStudents[index].name;
    document.getElementById('analyzeStudentBtn').disabled = false;
}

// 학생 상세 분석
document.getElementById('analyzeStudentBtn').addEventListener('click', function() {
    const numberSelect = document.getElementById('numberSelect');
    const index = numberSelect.value;
    
    if (index === 'all' || !currentStudents[index]) {
        alert('학생을 선택해주세요.');
        return;
    }
    
    displayStudentDetail(currentStudents[index]);
});

function displayStudentDetail(student) {
    const detailDiv = document.getElementById('studentDetail');
    
    detailDiv.innerHTML = `
        <div class="detail-card">
            <h3>${student.grade}학년 ${student.class}반 ${student.number}번 ${student.name}</h3>
            <p><strong>파일:</strong> ${student.fileName}</p>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <h3>평균 백분위</h3>
                    <div class="value">${getAveragePercentile(student).toFixed(1)}</div>
                    <div class="label">%</div>
                </div>
                <div class="stat-card">
                    <h3>평균 표준점수</h3>
                    <div class="value">${getAverageStandard(student).toFixed(1)}</div>
                    <div class="label">점</div>
                </div>
                <div class="stat-card">
                    <h3>평균 등급</h3>
                    <div class="value">${getAverageGrade(student).toFixed(2)}</div>
                    <div class="label">등급</div>
                </div>
                <div class="stat-card">
                    <h3>총점</h3>
                    <div class="value">${student.total}</div>
                    <div class="label">점</div>
                </div>
            </div>
            
            <h4>과목별 상세 성적</h4>
            <div id="studentSubjectTable"></div>
            
            <div class="chart-container">
                <canvas id="studentRadarChart"></canvas>
            </div>
        </div>
    `;
    
    createStudentSubjectTable(student);
    createStudentRadarChart(student);
}

// 차트 생성 함수들
function createClassPercentileChart() {
    const ctx = document.getElementById('classPercentileChart');
    if (!ctx) return;
    
    // 학급별 데이터 집계 (최신 순)
    const classData = {};
    allData.forEach(student => {
        const key = `${student.grade}-${student.class}`;
        if (!classData[key]) {
            classData[key] = [];
        }
        classData[key].push(getAveragePercentile(student));
    });
    
    const labels = Object.keys(classData).sort().reverse();
    const data = labels.map(key => calculateAverage(classData[key]));
    
    if (charts.classPercentile) {
        charts.classPercentile.destroy();
    }
    
    charts.classPercentile = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '평균 백분위',
                data: data,
                backgroundColor: 'rgba(102, 126, 234, 0.7)',
                borderColor: 'rgba(102, 126, 234, 1)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100
                }
            }
        }
    });
}

function createSubjectGradeChart() {
    const ctx = document.getElementById('subjectGradeChart');
    if (!ctx) return;
    
    const subjects = ['국어', '수학', '영어', '탐구1', '탐구2', '탐구3', '제2외국어'];
    const data = subjects.map(subject => {
        const grades = allData.map(s => s.subjects[subject]?.grade || 0).filter(g => g > 0);
        return grades.length > 0 ? calculateAverage(grades) : 0;
    });
    
    if (charts.subjectGrade) {
        charts.subjectGrade.destroy();
    }
    
    charts.subjectGrade = new Chart(ctx, {
        type: 'line',
        data: {
            labels: subjects,
            datasets: [{
                label: '평균 등급',
                data: data,
                borderColor: 'rgba(118, 75, 162, 1)',
                backgroundColor: 'rgba(118, 75, 162, 0.2)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    reverse: true,
                    min: 1,
                    max: 9
                }
            }
        }
    });
}

function createSubjectComparisonChart() {
    const ctx = document.getElementById('subjectComparisonChart');
    if (!ctx) return;
    
    const subjects = ['국어', '수학', '영어', '탐구1', '탐구2', '탐구3', '제2외국어'];
    
    const rawData = subjects.map(subject => {
        const scores = allData.map(s => s.subjects[subject]?.raw || 0).filter(s => s > 0);
        return scores.length > 0 ? calculateAverage(scores) : 0;
    });
    
    const standardData = subjects.map(subject => {
        const scores = allData.map(s => s.subjects[subject]?.standard || 0).filter(s => s > 0);
        return scores.length > 0 ? calculateAverage(scores) : 0;
    });
    
    if (charts.subjectComparison) {
        charts.subjectComparison.destroy();
    }
    
    charts.subjectComparison = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: subjects,
            datasets: [
                {
                    label: '평균 원점수',
                    data: rawData,
                    backgroundColor: 'rgba(102, 126, 234, 0.7)',
                    borderColor: 'rgba(102, 126, 234, 1)',
                    borderWidth: 2
                },
                {
                    label: '평균 표준점수',
                    data: standardData,
                    backgroundColor: 'rgba(118, 75, 162, 0.7)',
                    borderColor: 'rgba(118, 75, 162, 1)',
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function createClassComparisonChart() {
    const ctx = document.getElementById('classComparisonChart');
    if (!ctx) return;
    
    const classData = {};
    allData.forEach(student => {
        const key = `${student.grade}-${student.class}`;
        if (!classData[key]) {
            classData[key] = [];
        }
        classData[key].push(getAverageStandard(student));
    });
    
    const labels = Object.keys(classData).sort().reverse();
    const data = labels.map(key => calculateAverage(classData[key]));
    
    if (charts.classComparison) {
        charts.classComparison.destroy();
    }
    
    charts.classComparison = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '평균 표준점수',
                data: data,
                backgroundColor: 'rgba(102, 126, 234, 0.7)',
                borderColor: 'rgba(102, 126, 234, 1)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function createSubjectDetailTable() {
    const tableDiv = document.getElementById('subjectDetailTable');
    const subjects = ['국어', '수학', '영어', '탐구1', '탐구2', '탐구3', '제2외국어'];
    
    let html = '<table><thead><tr><th>과목</th><th>평균 원점수</th><th>평균 표준점수</th><th>평균 백분위</th><th>평균 등급</th></tr></thead><tbody>';
    
    subjects.forEach(subject => {
        const raw = allData.map(s => s.subjects[subject]?.raw || 0).filter(s => s > 0);
        const standard = allData.map(s => s.subjects[subject]?.standard || 0).filter(s => s > 0);
        const percentile = allData.map(s => s.subjects[subject]?.percentile || 0).filter(p => p > 0);
        const grade = allData.map(s => s.subjects[subject]?.grade || 0).filter(g => g > 0);
        
        html += `
            <tr>
                <td>${subject}</td>
                <td>${raw.length > 0 ? calculateAverage(raw).toFixed(1) : '-'}</td>
                <td>${standard.length > 0 ? calculateAverage(standard).toFixed(1) : '-'}</td>
                <td>${percentile.length > 0 ? calculateAverage(percentile).toFixed(1) : '-'}</td>
                <td>${grade.length > 0 ? calculateAverage(grade).toFixed(2) : '-'}</td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    tableDiv.innerHTML = html;
}

function createClassDetailTable() {
    const tableDiv = document.getElementById('classDetailTable');
    
    const classData = {};
    allData.forEach(student => {
        const key = `${student.grade}-${student.class}`;
        if (!classData[key]) {
            classData[key] = [];
        }
        classData[key].push(student);
    });
    
    let html = '<table><thead><tr><th>학급</th><th>학생 수</th><th>평균 백분위</th><th>평균 표준점수</th><th>평균 등급</th></tr></thead><tbody>';
    
    // 최신 학급 순으로 정렬
    Object.keys(classData).sort().reverse().forEach(key => {
        const students = classData[key];
        const avgPercentile = calculateAverage(students.map(s => getAveragePercentile(s)));
        const avgStandard = calculateAverage(students.map(s => getAverageStandard(s)));
        const avgGrade = calculateAverage(students.map(s => getAverageGrade(s)));
        
        html += `
            <tr>
                <td>${key}</td>
                <td>${students.length}명</td>
                <td>${avgPercentile.toFixed(1)}</td>
                <td>${avgStandard.toFixed(1)}</td>
                <td>${avgGrade.toFixed(2)}</td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    tableDiv.innerHTML = html;
}

function createStudentSubjectTable(student) {
    const tableDiv = document.getElementById('studentSubjectTable');
    const subjects = ['국어', '수학', '영어', '탐구1', '탐구2', '탐구3', '제2외국어'];
    
    let html = '<table><thead><tr><th>과목</th><th>원점수</th><th>표준점수</th><th>백분위</th><th>등급</th></tr></thead><tbody>';
    
    subjects.forEach(subject => {
        const data = student.subjects[subject];
        if (data && data.grade > 0) {
            html += `
                <tr>
                    <td>${subject}</td>
                    <td>${data.raw}</td>
                    <td>${data.standard}</td>
                    <td>${data.percentile}</td>
                    <td>${data.grade}</td>
                </tr>
            `;
        }
    });
    
    html += '</tbody></table>';
    tableDiv.innerHTML = html;
}

function createStudentRadarChart(student) {
    const ctx = document.getElementById('studentRadarChart');
    if (!ctx) return;
    
    const subjects = ['국어', '수학', '영어', '탐구1', '탐구2', '탐구3', '제2외국어'];
    const data = subjects.map(subject => {
        const grade = student.subjects[subject]?.grade || 0;
        return grade > 0 ? 10 - grade : 0; // 등급을 역으로 계산 (1등급 = 9점)
    });
    
    if (charts.studentRadar) {
        charts.studentRadar.destroy();
    }
    
    charts.studentRadar = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: subjects,
            datasets: [{
                label: '과목별 성적',
                data: data,
                backgroundColor: 'rgba(102, 126, 234, 0.3)',
                borderColor: 'rgba(102, 126, 234, 1)',
                pointBackgroundColor: 'rgba(102, 126, 234, 1)',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgba(102, 126, 234, 1)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    beginAtZero: true,
                    max: 9
                }
            }
        }
    });
}

// 유틸리티 함수들
function calculateAverage(arr) {
    if (arr.length === 0) return 0;
    const sum = arr.reduce((a, b) => a + b, 0);
    return sum / arr.length;
}

function getAveragePercentile(student) {
    const percentiles = Object.values(student.subjects)
        .map(s => s.percentile)
        .filter(p => p > 0);
    return calculateAverage(percentiles);
}

function getAverageStandard(student) {
    const standards = Object.values(student.subjects)
        .map(s => s.standard)
        .filter(s => s > 0);
    return calculateAverage(standards);
}

function getAverageRaw(student) {
    const raws = Object.values(student.subjects)
        .map(s => s.raw)
        .filter(r => r > 0);
    return calculateAverage(raws);
}

function getAverageGrade(student) {
    const grades = Object.values(student.subjects)
        .map(s => s.grade)
        .filter(g => g > 0);
    return calculateAverage(grades);
}

// 탭 전환
document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('click', function() {
        const tabName = this.getAttribute('data-tab');
        
        // 모든 탭 버튼과 컨텐츠 비활성화
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        // 선택된 탭 활성화
        this.classList.add('active');
        document.getElementById(tabName + 'Tab').classList.add('active');
    });
});

// 데이터 내보내기
document.getElementById('exportBtn').addEventListener('click', function() {
    if (allData.length === 0) {
        alert('먼저 데이터를 분석해주세요.');
        return;
    }
    
    // 최신 데이터 순으로 내보내기
    const ws = XLSX.utils.json_to_sheet(allData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '통합데이터');
    
    const fileName = `통합데이터_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
});

// HTML 저장
document.getElementById('saveHtmlBtn').addEventListener('click', function() {
    const html = document.documentElement.outerHTML;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `분석결과_${new Date().toISOString().split('T')[0]}.html`;
    a.click();
    URL.revokeObjectURL(url);
});
