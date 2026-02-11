// 전역 변수
let allData = [];
let currentStudent = null;

// DOM 요소
const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const fileList = document.getElementById('fileList');
const analyzeBtn = document.getElementById('analyzeBtn');
const exportBtn = document.getElementById('exportBtn');
const saveHtmlBtn = document.getElementById('saveHtmlBtn');
const tabsSection = document.getElementById('tabsSection');
const loadingOverlay = document.getElementById('loadingOverlay');

// 초기화
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
});

function initializeEventListeners() {
    // 파일 업로드 이벤트
    uploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    
    // 드래그 앤 드롭
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleFileSelect({ target: { files: e.dataTransfer.files } });
    });
    
    // 버튼 이벤트
    analyzeBtn.addEventListener('click', analyzeData);
    exportBtn.addEventListener('click', exportData);
    saveHtmlBtn.addEventListener('click', saveAsHtml);
    
    // 탭 이벤트
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
    
    // 학생 탭 이벤트
    document.querySelectorAll('.student-tab').forEach(tab => {
        tab.addEventListener('click', () => switchStudentTab(tab.dataset.tab));
    });
    
    // 필터 이벤트
    const gradeFilter = document.getElementById('gradeFilter');
    const classFilter = document.getElementById('classFilter');
    const numberFilter = document.getElementById('numberFilter');
    const analyzeStudentBtn = document.getElementById('analyzeStudentBtn');
    const classAllPdfBtn = document.getElementById('classAllPdfBtn');
    
    if (gradeFilter) {
        gradeFilter.addEventListener('change', updateClassFilter);
    }
    if (classFilter) {
        classFilter.addEventListener('change', updateNumberFilter);
    }
    if (numberFilter) {
        numberFilter.addEventListener('change', updateStudentName);
    }
    if (analyzeStudentBtn) {
        analyzeStudentBtn.addEventListener('click', analyzeStudent);
    }
    if (classAllPdfBtn) {
        classAllPdfBtn.addEventListener('click', generateClassPdf);
    }
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    
    files.forEach(file => {
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xlsm')) {
            displayFile(file);
        } else {
            alert(`${file.name}은(는) 지원하지 않는 형식입니다. XLSX 또는 XLSM 파일만 업로드 가능합니다.`);
        }
    });
    
    analyzeBtn.disabled = fileList.children.length === 0;
}

function displayFile(file) {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    fileItem.dataset.fileName = file.name;
    
    const fileName = document.createElement('span');
    fileName.className = 'file-name';
    fileName.textContent = file.name;
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-file';
    removeBtn.textContent = '삭제';
    removeBtn.onclick = () => {
        fileItem.remove();
        analyzeBtn.disabled = fileList.children.length === 0;
    };
    
    fileItem.appendChild(fileName);
    fileItem.appendChild(removeBtn);
    fileList.appendChild(fileItem);
    
    // 파일 객체 저장
    fileItem.fileObject = file;
}

async function analyzeData() {
    showLoading(true);
    allData = [];
    
    try {
        const fileItems = Array.from(fileList.querySelectorAll('.file-item'));
        
        for (const item of fileItems) {
            const file = item.fileObject;
            const data = await readExcelFile(file);
            
            if (data && data.length > 0) {
                allData.push({
                    fileName: file.name,
                    date: extractDateFromFileName(file.name),
                    data: data
                });
            }
        }
        
        // 최신 데이터가 먼저 오도록 정렬 (날짜 기준 내림차순)
        allData.sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            return dateB - dateA; // 최신 날짜가 앞으로
        });
        
        if (allData.length > 0) {
            displayResults();
            tabsSection.style.display = 'block';
            exportBtn.disabled = false;
            saveHtmlBtn.disabled = false;
        } else {
            alert('분석할 데이터가 없습니다.');
        }
        
    } catch (error) {
        console.error('분석 중 오류:', error);
        alert('데이터 분석 중 오류가 발생했습니다: ' + error.message);
    } finally {
        showLoading(false);
    }
}

function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                // DATA 시트 찾기
                const sheetName = workbook.SheetNames.find(name => 
                    name.toUpperCase() === 'DATA'
                ) || workbook.SheetNames[0];
                
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                
                const parsedData = parseStudentData(jsonData);
                resolve(parsedData);
                
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = () => reject(new Error('파일 읽기 실패'));
        reader.readAsArrayBuffer(file);
    });
}

function parseStudentData(jsonData) {
    if (!jsonData || jsonData.length < 3) {
        return [];
    }
    
    const students = [];
    
    // 3행부터 학생 데이터
    for (let i = 2; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length < 4) continue;
        
        const student = {
            grade: row[0],
            class: row[1],
            number: row[2],
            name: row[3],
            subjects: {}
        };
        
        // 과목별 데이터 파싱 (국어, 수학, 영어, 탐구 등)
        let colIndex = 4;
        const subjectNames = ['국어', '수학', '영어', '탐구1', '탐구2', '탐구3', '제2외국어'];
        
        for (const subjectName of subjectNames) {
            if (colIndex + 4 < row.length) {
                student.subjects[subjectName] = {
                    subject: row[colIndex] || subjectName,
                    raw: parseFloat(row[colIndex + 1]) || 0,
                    standard: parseFloat(row[colIndex + 2]) || 0,
                    percentile: parseFloat(row[colIndex + 3]) || 0,
                    grade: parseInt(row[colIndex + 4]) || 0
                };
                colIndex += 5;
            }
        }
        
        students.push(student);
    }
    
    return students;
}

function extractDateFromFileName(fileName) {
    // 파일명에서 날짜 추출 (예: 2024_03_모의고사.xlsx -> 2024-03)
    const match = fileName.match(/(\d{4})[\s_-]*(\d{1,2})/);
    if (match) {
        const year = match[1];
        const month = match[2].padStart(2, '0');
        return `${year}-${month}`;
    }
    return fileName;
}

function displayResults() {
    displayOverallStats();
    displaySubjectAnalysis();
    displayClassAnalysis();
    initializeStudentFilters();
}

function displayOverallStats() {
    const container = document.getElementById('overallCharts');
    container.innerHTML = '';
    
    // 각 회차별로 통계 표시 (최신순)
    allData.forEach(examData => {
        const card = document.createElement('div');
        card.className = 'chart-card';
        
        const title = document.createElement('h3');
        title.textContent = `📊 ${examData.fileName} - 전체 통계`;
        card.appendChild(title);
        
        // 기본 통계
        const stats = calculateBasicStats(examData.data);
        
        const statsGrid = document.createElement('div');
        statsGrid.className = 'stats-grid';
        statsGrid.innerHTML = `
            <div class="stat-card">
                <div class="stat-label">전체 학생 수</div>
                <div class="stat-value">${stats.totalStudents}명</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">평균 백분위</div>
                <div class="stat-value">${stats.avgPercentile.toFixed(2)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">평균 표준점수</div>
                <div class="stat-value">${stats.avgStandard.toFixed(2)}</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">평균 원점수</div>
                <div class="stat-value">${stats.avgRaw.toFixed(2)}</div>
            </div>
        `;
        card.appendChild(statsGrid);
        
        // 차트 추가
        const chartWrapper = document.createElement('div');
        chartWrapper.className = 'chart-wrapper';
        const canvas = document.createElement('canvas');
        chartWrapper.appendChild(canvas);
        card.appendChild(chartWrapper);
        
        container.appendChild(card);
        
        // 차트 그리기
        createGradeDistributionChart(canvas, examData.data);
    });
    
    // 첫 번째(최신) 데이터로 상단 통계 업데이트
    if (allData.length > 0) {
        const latestStats = calculateBasicStats(allData[0].data);
        document.getElementById('totalStudents').textContent = `${latestStats.totalStudents}명`;
        document.getElementById('avgPercentile').textContent = latestStats.avgPercentile.toFixed(2);
        document.getElementById('avgStandard').textContent = latestStats.avgStandard.toFixed(2);
        document.getElementById('avgRaw').textContent = latestStats.avgRaw.toFixed(2);
    }
}

function calculateBasicStats(students) {
    let totalPercentile = 0;
    let totalStandard = 0;
    let totalRaw = 0;
    let count = 0;
    
    students.forEach(student => {
        Object.values(student.subjects).forEach(subject => {
            if (subject.percentile > 0) {
                totalPercentile += subject.percentile;
                totalStandard += subject.standard;
                totalRaw += subject.raw;
                count++;
            }
        });
    });
    
    return {
        totalStudents: students.length,
        avgPercentile: count > 0 ? totalPercentile / count : 0,
        avgStandard: count > 0 ? totalStandard / count : 0,
        avgRaw: count > 0 ? totalRaw / count : 0
    };
}

function createGradeDistributionChart(canvas, students) {
    const gradeCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    
    students.forEach(student => {
        Object.values(student.subjects).forEach(subject => {
            if (subject.grade >= 1 && subject.grade <= 9) {
                gradeCounts[subject.grade - 1]++;
            }
        });
    });
    
    new Chart(canvas, {
        type: 'bar',
        data: {
            labels: ['1등급', '2등급', '3등급', '4등급', '5등급', '6등급', '7등급', '8등급', '9등급'],
            datasets: [{
                label: '학생 수',
                data: gradeCounts,
                backgroundColor: [
                    '#4a90e2', '#5cb85c', '#5bc0de', '#f0ad4e', 
                    '#d9534f', '#9b59b6', '#34495e', '#95a5a6', '#7f8c8d'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: '등급별 분포',
                    font: { size: 16, weight: 'bold' }
                },
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                }
            }
        }
    });
}

function displaySubjectAnalysis() {
    const container = document.getElementById('subjectCharts');
    container.innerHTML = '';
    
    // 각 회차별로 과목 분석 표시 (최신순)
    allData.forEach(examData => {
        const card = document.createElement('div');
        card.className = 'chart-card';
        
        const title = document.createElement('h3');
        title.textContent = `📚 ${examData.fileName} - 과목별 평균`;
        card.appendChild(title);
        
        const chartWrapper = document.createElement('div');
        chartWrapper.className = 'chart-wrapper';
        const canvas = document.createElement('canvas');
        chartWrapper.appendChild(canvas);
        card.appendChild(chartWrapper);
        
        container.appendChild(card);
        
        createSubjectComparisonChart(canvas, examData.data);
    });
}

function createSubjectComparisonChart(canvas, students) {
    const subjectStats = {};
    
    students.forEach(student => {
        Object.entries(student.subjects).forEach(([subjectName, subject]) => {
            if (!subjectStats[subjectName]) {
                subjectStats[subjectName] = { total: 0, count: 0 };
            }
            if (subject.raw > 0) {
                subjectStats[subjectName].total += subject.raw;
                subjectStats[subjectName].count++;
            }
        });
    });
    
    const labels = Object.keys(subjectStats);
    const averages = labels.map(label => {
        const stat = subjectStats[label];
        return stat.count > 0 ? stat.total / stat.count : 0;
    });
    
    new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '평균 원점수',
                data: averages,
                backgroundColor: '#4a90e2'
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

function displayClassAnalysis() {
    const container = document.getElementById('classCharts');
    container.innerHTML = '';
    
    // 각 회차별로 학급 분석 표시 (최신순)
    allData.forEach(examData => {
        const card = document.createElement('div');
        card.className = 'chart-card';
        
        const title = document.createElement('h3');
        title.textContent = `🏫 ${examData.fileName} - 학급별 평균`;
        card.appendChild(title);
        
        const chartWrapper = document.createElement('div');
        chartWrapper.className = 'chart-wrapper';
        const canvas = document.createElement('canvas');
        chartWrapper.appendChild(canvas);
        card.appendChild(chartWrapper);
        
        container.appendChild(card);
        
        createClassComparisonChart(canvas, examData.data);
    });
}

function createClassComparisonChart(canvas, students) {
    const classStats = {};
    
    students.forEach(student => {
        const classKey = `${student.grade}-${student.class}`;
        if (!classStats[classKey]) {
            classStats[classKey] = { total: 0, count: 0 };
        }
        
        Object.values(student.subjects).forEach(subject => {
            if (subject.percentile > 0) {
                classStats[classKey].total += subject.percentile;
                classStats[classKey].count++;
            }
        });
    });
    
    const labels = Object.keys(classStats).sort();
    const averages = labels.map(label => {
        const stat = classStats[label];
        return stat.count > 0 ? stat.total / stat.count : 0;
    });
    
    new Chart(canvas, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '평균 백분위',
                data: averages,
                backgroundColor: '#5cb85c'
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

function initializeStudentFilters() {
    const gradeFilter = document.getElementById('gradeFilter');
    const classFilter = document.getElementById('classFilter');
    const numberFilter = document.getElementById('numberFilter');
    
    // 초기화
    gradeFilter.innerHTML = '<option value="">전체</option>';
    classFilter.innerHTML = '<option value="">전체</option>';
    numberFilter.innerHTML = '<option value="">학생 선택</option>';
    
    // 최신 데이터를 기준으로 필터 생성
    if (allData.length === 0) return;
    
    const latestData = allData[0].data;
    const grades = [...new Set(latestData.map(s => s.grade))].sort();
    
    grades.forEach(grade => {
        const option = document.createElement('option');
        option.value = grade;
        option.textContent = `${grade}학년`;
        gradeFilter.appendChild(option);
    });
    
    displayStudentTable();
}

function updateClassFilter() {
    const gradeFilter = document.getElementById('gradeFilter');
    const classFilter = document.getElementById('classFilter');
    const selectedGrade = gradeFilter.value;
    
    classFilter.innerHTML = '<option value="">전체</option>';
    
    if (!selectedGrade || allData.length === 0) return;
    
    const latestData = allData[0].data;
    const classes = [...new Set(
        latestData
            .filter(s => s.grade == selectedGrade)
            .map(s => s.class)
    )].sort((a, b) => a - b);
    
    classes.forEach(classNum => {
        const option = document.createElement('option');
        option.value = classNum;
        option.textContent = `${classNum}반`;
        classFilter.appendChild(option);
    });
    
    updateNumberFilter();
}

function updateNumberFilter() {
    const gradeFilter = document.getElementById('gradeFilter');
    const classFilter = document.getElementById('classFilter');
    const numberFilter = document.getElementById('numberFilter');
    const analyzeStudentBtn = document.getElementById('analyzeStudentBtn');
    const classAllPdfBtn = document.getElementById('classAllPdfBtn');
    
    const selectedGrade = gradeFilter.value;
    const selectedClass = classFilter.value;
    
    numberFilter.innerHTML = '<option value="">학생 선택</option>';
    document.getElementById('nameDisplay').value = '';
    
    if (!selectedGrade || !selectedClass || allData.length === 0) {
        analyzeStudentBtn.disabled = true;
        classAllPdfBtn.disabled = true;
        return;
    }
    
    const latestData = allData[0].data;
    const students = latestData
        .filter(s => s.grade == selectedGrade && s.class == selectedClass)
        .sort((a, b) => a.number - b.number);
    
    students.forEach(student => {
        const option = document.createElement('option');
        option.value = student.number;
        option.textContent = `${student.number}번`;
        option.dataset.name = student.name;
        numberFilter.appendChild(option);
    });
    
    classAllPdfBtn.disabled = false;
}

function updateStudentName() {
    const numberFilter = document.getElementById('numberFilter');
    const nameDisplay = document.getElementById('nameDisplay');
    const analyzeStudentBtn = document.getElementById('analyzeStudentBtn');
    
    const selectedOption = numberFilter.options[numberFilter.selectedIndex];
    
    if (selectedOption && selectedOption.dataset.name) {
        nameDisplay.value = selectedOption.dataset.name;
        analyzeStudentBtn.disabled = false;
    } else {
        nameDisplay.value = '';
        analyzeStudentBtn.disabled = true;
    }
}

function displayStudentTable() {
    const container = document.getElementById('studentTable');
    
    if (allData.length === 0) {
        container.innerHTML = '<p>분석할 데이터가 없습니다.</p>';
        return;
    }
    
    const latestData = allData[0].data;
    
    let html = '<div class="chart-card"><h3>📋 학생 목록</h3>';
    html += '<table><thead><tr>';
    html += '<th>학년</th><th>반</th><th>번호</th><th>이름</th>';
    
    // 과목 헤더
    if (latestData.length > 0) {
        Object.keys(latestData[0].subjects).forEach(subjectName => {
            html += `<th>${subjectName}</th>`;
        });
    }
    
    html += '</tr></thead><tbody>';
    
    latestData.forEach(student => {
        html += `<tr>`;
        html += `<td>${student.grade}</td>`;
        html += `<td>${student.class}</td>`;
        html += `<td>${student.number}</td>`;
        html += `<td>${student.name}</td>`;
        
        Object.values(student.subjects).forEach(subject => {
            html += `<td>${subject.grade}등급</td>`;
        });
        
        html += `</tr>`;
    });
    
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

function analyzeStudent() {
    const gradeFilter = document.getElementById('gradeFilter');
    const classFilter = document.getElementById('classFilter');
    const numberFilter = document.getElementById('numberFilter');
    
    const selectedGrade = gradeFilter.value;
    const selectedClass = classFilter.value;
    const selectedNumber = numberFilter.value;
    
    if (!selectedGrade || !selectedClass || !selectedNumber) {
        alert('학생을 선택해주세요.');
        return;
    }
    
    // 모든 회차에서 해당 학생 데이터 수집 (최신순으로 이미 정렬됨)
    const studentHistory = [];
    
    allData.forEach(examData => {
        const student = examData.data.find(s => 
            s.grade == selectedGrade && 
            s.class == selectedClass && 
            s.number == selectedNumber
        );
        
        if (student) {
            studentHistory.push({
                examName: examData.fileName,
                date: examData.date,
                data: student
            });
        }
    });
    
    displayStudentDetail(studentHistory);
    switchStudentTab('detail');
}

function displayStudentDetail(studentHistory) {
    const container = document.getElementById('studentDetail');
    
    if (studentHistory.length === 0) {
        container.innerHTML = '<p>선택한 학생의 데이터가 없습니다.</p>';
        return;
    }
    
    let html = '<div class="chart-card">';
    html += `<h3>👤 ${studentHistory[0].data.name} 학생 상세 분석</h3>`;
    html += `<p>학년: ${studentHistory[0].data.grade}, 반: ${studentHistory[0].data.class}, 번호: ${studentHistory[0].data.number}</p>`;
    
    // 각 회차별 성적 표시 (최신순)
    studentHistory.forEach(history => {
        html += `<h4>📅 ${history.examName}</h4>`;
        html += '<table><thead><tr>';
        html += '<th>과목</th><th>원점수</th><th>표준점수</th><th>백분위</th><th>등급</th>';
        html += '</tr></thead><tbody>';
        
        Object.entries(history.data.subjects).forEach(([subjectName, subject]) => {
            html += '<tr>';
            html += `<td>${subject.subject || subjectName}</td>`;
            html += `<td>${subject.raw}</td>`;
            html += `<td>${subject.standard}</td>`;
            html += `<td>${subject.percentile}</td>`;
            html += `<td>${subject.grade}등급</td>`;
            html += '</tr>';
        });
        
        html += '</tbody></table><br>';
    });
    
    html += '</div>';
    container.innerHTML = html;
}

function generateClassPdf() {
    alert('학급 전체 PDF 생성 기능은 추후 구현 예정입니다.');
}

function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
    });
    
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(tabName).classList.add('active');
}

function switchStudentTab(tabName) {
    document.querySelectorAll('.student-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.student-content').forEach(content => {
        content.classList.remove('active');
    });
    
    document.querySelector(`.student-tab[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`student${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`).classList.add('active');
}

function exportData() {
    if (allData.length === 0) {
        alert('내보낼 데이터가 없습니다.');
        return;
    }
    
    // 통합 데이터 생성 (최신순)
    const combinedData = [];
    
    allData.forEach(examData => {
        examData.data.forEach(student => {
            const row = {
                '시험명': examData.fileName,
                '학년': student.grade,
                '반': student.class,
                '번호': student.number,
                '이름': student.name
            };
            
            Object.entries(student.subjects).forEach(([subjectName, subject]) => {
                row[`${subjectName}_원점수`] = subject.raw;
                row[`${subjectName}_표준점수`] = subject.standard;
                row[`${subjectName}_백분위`] = subject.percentile;
                row[`${subjectName}_등급`] = subject.grade;
            });
            
            combinedData.push(row);
        });
    });
    
    // 엑셀 파일 생성
    const ws = XLSX.utils.json_to_sheet(combinedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '통합데이터');
    
    XLSX.writeFile(wb, '모의고사_통합데이터.xlsx');
}

function saveAsHtml() {
    const htmlContent = document.documentElement.outerHTML;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '모의고사_분석결과.html';
    a.click();
    URL.revokeObjectURL(url);
}

function showLoading(show) {
    if (show) {
        loadingOverlay.classList.add('active');
    } else {
        loadingOverlay.classList.remove('active');
    }
}
