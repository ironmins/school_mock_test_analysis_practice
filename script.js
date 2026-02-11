// ==========================================
// 고등학교 모의고사 성적 분석 프로그램
// Chart destroy 오류 수정 버전
// ==========================================

// 전역 변수
let uploadedFiles = [];
let allStudentsData = [];
let analysisResults = null;

// 차트 객체 관리 (오류 방지)
const charts = {
    classPercentileChart: null,
    subjectAverageChart: null,
    gradeDistributionChart: null,
    classComparisonChart: null
};

// DOM 요소
const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const fileList = document.getElementById('fileList');
const analyzeBtn = document.getElementById('analyzeBtn');
const exportDbBtn = document.getElementById('exportDbBtn');
const saveHtmlBtn = document.getElementById('saveHtmlBtn');
const loadingOverlay = document.getElementById('loadingOverlay');

// 초기화
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    disableButtons();
});

// ==========================================
// 차트 관리 헬퍼 함수 (오류 수정의 핵심!)
// ==========================================

// 안전하게 차트 삭제
function safeDestroyChart(chartName) {
    if (charts[chartName]) {
        try {
            if (typeof charts[chartName].destroy === 'function') {
                charts[chartName].destroy();
            }
        } catch (e) {
            console.warn(`차트 ${chartName} 제거 중 오류:`, e);
        }
        charts[chartName] = null;
    }
}

// 모든 차트 삭제
function destroyAllCharts() {
    Object.keys(charts).forEach(chartName => {
        safeDestroyChart(chartName);
    });
}

// ==========================================
// 이벤트 리스너
// ==========================================

function setupEventListeners() {
    // 파일 업로드
    if (fileInput) fileInput.addEventListener('change', handleFileSelect);
    
    // 드래그 앤 드롭
    if (dropZone) {
        dropZone.addEventListener('dragover', handleDragOver);
        dropZone.addEventListener('dragleave', handleDragLeave);
        dropZone.addEventListener('drop', handleDrop);
    }
    
    // 버튼
    if (analyzeBtn) analyzeBtn.addEventListener('click', analyzeData);
    if (exportDbBtn) exportDbBtn.addEventListener('click', exportDatabase);
    if (saveHtmlBtn) saveHtmlBtn.addEventListener('click', saveAsHtml);
    
    // 탭 전환
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', switchTab);
    });
    
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        btn.addEventListener('click', switchSubTab);
    });
    
    // 필터
    const gradeFilter = document.getElementById('gradeFilter');
    const classFilter = document.getElementById('classFilter');
    const numberFilter = document.getElementById('numberFilter');
    
    if (gradeFilter) gradeFilter.addEventListener('change', updateFilters);
    if (classFilter) classFilter.addEventListener('change', updateFilters);
    if (numberFilter) numberFilter.addEventListener('change', updateStudentInfo);
    
    // 학생별 분석 버튼
    const detailBtn = document.getElementById('detailAnalysisBtn');
    const pdfBtn = document.getElementById('classPdfBtn');
    
    if (detailBtn) detailBtn.addEventListener('click', showDetailAnalysis);
    if (pdfBtn) pdfBtn.addEventListener('click', generateClassPdf);
}

// ==========================================
// 파일 처리
// ==========================================

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    addFiles(files);
}

function handleDragOver(e) {
    e.preventDefault();
    if (dropZone) dropZone.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    if (dropZone) dropZone.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    if (dropZone) dropZone.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files).filter(file => 
        file.name.endsWith('.xlsx') || file.name.endsWith('.xlsm')
    );
    addFiles(files);
}

function addFiles(files) {
    uploadedFiles = uploadedFiles.concat(files);
    updateFileList();
    enableButtons();
}

function updateFileList() {
    if (!fileList) return;
    
    fileList.innerHTML = '';
    fileList.style.display = uploadedFiles.length > 0 ? 'block' : 'none';
    
    uploadedFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <span>📄 ${file.name} (${(file.size / 1024).toFixed(2)} KB)</span>
            <button onclick="removeFile(${index})">삭제</button>
        `;
        fileList.appendChild(fileItem);
    });
}

function removeFile(index) {
    uploadedFiles.splice(index, 1);
    updateFileList();
    if (uploadedFiles.length === 0) {
        disableButtons();
    }
}

function enableButtons() {
    if (analyzeBtn) analyzeBtn.disabled = false;
}

function disableButtons() {
    if (analyzeBtn) analyzeBtn.disabled = true;
    if (exportDbBtn) exportDbBtn.disabled = true;
    if (saveHtmlBtn) saveHtmlBtn.disabled = true;
}

// ==========================================
// 데이터 분석 (오류 수정됨!)
// ==========================================

async function analyzeData() {
    showLoading();
    allStudentsData = [];
    
    // ✅ 핵심 수정: 기존 차트 모두 안전하게 제거
    destroyAllCharts();
    
    try {
        for (const file of uploadedFiles) {
            const data = await parseExcelFile(file);
            allStudentsData = allStudentsData.concat(data);
        }
        
        if (allStudentsData.length > 0) {
            analysisResults = performAnalysis(allStudentsData);
            displayResults(analysisResults);
            if (exportDbBtn) exportDbBtn.disabled = false;
            if (saveHtmlBtn) saveHtmlBtn.disabled = false;
            alert('분석이 완료되었습니다!');
        } else {
            alert('데이터를 찾을 수 없습니다. 올바른 파일을 업로드했는지 확인해주세요.');
        }
    } catch (error) {
        console.error('분석 오류:', error);
        alert('파일 분석 중 오류가 발생했습니다: ' + error.message);
    } finally {
        hideLoading();
    }
}

// 엑셀 파일 파싱
function parseExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                
                // DATA 시트 찾기
                if (!workbook.SheetNames.includes('DATA')) {
                    throw new Error('DATA 시트를 찾을 수 없습니다. 올바른 파일 형식인지 확인해주세요.');
                }
                
                const worksheet = workbook.Sheets['DATA'];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                
                const students = parseStudentData(jsonData);
                resolve(students);
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = function(error) {
            reject(error);
        };
        
        reader.readAsArrayBuffer(file);
    });
}

// 학생 데이터 파싱
function parseStudentData(rawData) {
    const students = [];
    
    if (rawData.length < 3) {
        throw new Error('데이터가 부족합니다. 최소 3행 이상이 필요합니다.');
    }
    
    // 3행부터 학생 데이터 (1행: 영역명, 2행: 세부항목)
    for (let i = 2; i < rawData.length; i++) {
        const row = rawData[i];
        if (!row || row.length < 4 || !row[3]) continue; // 이름이 없으면 스킵
        
        const student = {
            grade: row[0] || 1,
            class: row[1] || 1,
            number: row[2] || (i - 2),
            name: row[3],
            subjects: {}
        };
        
        // 국어 (열 5-9: 과목명, 원점수, 표준점수, 백분위, 등급)
        if (row[5] !== null && row[5] !== undefined) {
            student.subjects['국어'] = {
                raw: parseFloat(row[5]) || 0,
                standard: parseFloat(row[6]) || 0,
                percentile: parseFloat(row[7]) || 0,
                grade: parseInt(row[8]) || 9
            };
        }
        
        // 수학 (열 10-14)
        if (row[10] !== null && row[10] !== undefined) {
            student.subjects['수학'] = {
                raw: parseFloat(row[10]) || 0,
                standard: parseFloat(row[11]) || 0,
                percentile: parseFloat(row[12]) || 0,
                grade: parseInt(row[13]) || 9
            };
        }
        
        // 영어 (열 15-19, 원점수는 15번 열)
        if (row[15] !== null && row[15] !== undefined) {
            student.subjects['영어'] = {
                raw: parseFloat(row[15]) || 0,
                standard: parseFloat(row[16]) || 0,
                percentile: parseFloat(row[17]) || 0,
                grade: parseInt(row[18]) || 9
            };
        }
        
        // 탐구1 (열 20: 탐구유형, 열 21-25: 과목명, 원점수, 표준점수, 백분위, 등급)
        if (row[20] && row[21] !== null && row[21] !== undefined) {
            const subject1Name = row[20] || '탐구1';
            student.subjects[subject1Name] = {
                raw: parseFloat(row[21]) || 0,
                standard: parseFloat(row[22]) || 0,
                percentile: parseFloat(row[23]) || 0,
                grade: parseInt(row[24]) || 9
            };
        }
        
        // 탐구2 (열 25: 과목명, 열 26-29)
        if (row[25] && row[26] !== null && row[26] !== undefined) {
            const subject2Name = row[25] || '탐구2';
            student.subjects[subject2Name] = {
                raw: parseFloat(row[26]) || 0,
                standard: parseFloat(row[27]) || 0,
                percentile: parseFloat(row[28]) || 0,
                grade: parseInt(row[29]) || 9
            };
        }
        
        // 평균 계산
        const subjectValues = Object.values(student.subjects);
        if (subjectValues.length > 0) {
            student.avgPercentile = subjectValues.reduce((sum, s) => sum + (s.percentile || 0), 0) / subjectValues.length;
            student.avgStandard = subjectValues.reduce((sum, s) => sum + (s.standard || 0), 0) / subjectValues.length;
            student.avgRaw = subjectValues.reduce((sum, s) => sum + (s.raw || 0), 0) / subjectValues.length;
            student.avgGrade = subjectValues.reduce((sum, s) => sum + (s.grade || 9), 0) / subjectValues.length;
            
            students.push(student);
        }
    }
    
    if (students.length === 0) {
        throw new Error('유효한 학생 데이터를 찾을 수 없습니다.');
    }
    
    return students;
}

// ==========================================
// 데이터 분석 수행
// ==========================================

function performAnalysis(students) {
    const results = {
        total: students.length,
        byClass: {},
        bySubject: {},
        overall: {
            avgPercentile: 0,
            avgStandard: 0,
            avgRaw: 0,
            avgGrade: 0
        }
    };
    
    // 전체 통계
    let totalPercentile = 0;
    let totalStandard = 0;
    let totalRaw = 0;
    let totalGrade = 0;
    
    students.forEach(student => {
        totalPercentile += student.avgPercentile || 0;
        totalStandard += student.avgStandard || 0;
        totalRaw += student.avgRaw || 0;
        totalGrade += student.avgGrade || 0;
        
        // 학급별 통계
        const classKey = `${student.grade}-${student.class}`;
        if (!results.byClass[classKey]) {
            results.byClass[classKey] = {
                students: [],
                avgPercentile: 0,
                avgStandard: 0,
                avgGrade: 0
            };
        }
        results.byClass[classKey].students.push(student);
        
        // 과목별 통계
        Object.keys(student.subjects).forEach(subjectName => {
            if (!results.bySubject[subjectName]) {
                results.bySubject[subjectName] = {
                    students: 0,
                    totalRaw: 0,
                    totalStandard: 0,
                    totalPercentile: 0,
                    totalGrade: 0
                };
            }
            const subject = student.subjects[subjectName];
            results.bySubject[subjectName].students++;
            results.bySubject[subjectName].totalRaw += subject.raw || 0;
            results.bySubject[subjectName].totalStandard += subject.standard || 0;
            results.bySubject[subjectName].totalPercentile += subject.percentile || 0;
            results.bySubject[subjectName].totalGrade += subject.grade || 9;
        });
    });
    
    results.overall.avgPercentile = totalPercentile / students.length;
    results.overall.avgStandard = totalStandard / students.length;
    results.overall.avgRaw = totalRaw / students.length;
    results.overall.avgGrade = totalGrade / students.length;
    
    // 학급별 평균 계산
    Object.keys(results.byClass).forEach(classKey => {
        const classData = results.byClass[classKey];
        const count = classData.students.length;
        classData.avgPercentile = classData.students.reduce((sum, s) => sum + (s.avgPercentile || 0), 0) / count;
        classData.avgStandard = classData.students.reduce((sum, s) => sum + (s.avgStandard || 0), 0) / count;
        classData.avgGrade = classData.students.reduce((sum, s) => sum + (s.avgGrade || 9), 0) / count;
    });
    
    // 과목별 평균 계산
    Object.keys(results.bySubject).forEach(subjectName => {
        const subject = results.bySubject[subjectName];
        if (subject.students > 0) {
            subject.avgRaw = subject.totalRaw / subject.students;
            subject.avgStandard = subject.totalStandard / subject.students;
            subject.avgPercentile = subject.totalPercentile / subject.students;
            subject.avgGrade = subject.totalGrade / subject.students;
        }
    });
    
    return results;
}

// ==========================================
// 결과 표시
// ==========================================

function displayResults(results) {
    // 전체 통계 표시
    const totalStudentsEl = document.getElementById('totalStudents');
    const avgPercentileEl = document.getElementById('avgPercentile');
    const avgStandardEl = document.getElementById('avgStandard');
    const avgRawEl = document.getElementById('avgRaw');
    
    if (totalStudentsEl) totalStudentsEl.textContent = results.total;
    if (avgPercentileEl) avgPercentileEl.textContent = results.overall.avgPercentile.toFixed(2);
    if (avgStandardEl) avgStandardEl.textContent = results.overall.avgStandard.toFixed(2);
    if (avgRawEl) avgRawEl.textContent = results.overall.avgRaw.toFixed(2);
    
    // 차트 생성 (안전하게)
    createClassPercentileChart(results.byClass);
    createSubjectAverageChart(results.bySubject);
    createGradeDistributionChart(results.overall);
    createClassComparisonChart(results.byClass);
    
    // 학생별 분석 준비
    updateStudentFilters();
    displayStudentTable();
}

// ==========================================
// 차트 생성 (✅ 오류 완전 수정!)
// ==========================================

function createClassPercentileChart(byClass) {
    // ✅ 기존 차트 안전하게 제거
    safeDestroyChart('classPercentileChart');
    
    const canvas = document.getElementById('classPercentileChart');
    if (!canvas) {
        console.warn('classPercentileChart canvas를 찾을 수 없습니다.');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    const labels = Object.keys(byClass).map(key => key.replace('-', '학년 ') + '반');
    const data = Object.values(byClass).map(c => c.avgPercentile.toFixed(2));
    
    charts.classPercentileChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '학급별 평균 백분위',
                data: data,
                backgroundColor: 'rgba(102, 126, 234, 0.6)',
                borderColor: 'rgba(102, 126, 234, 1)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100
                }
            }
        }
    });
}

function createSubjectAverageChart(bySubject) {
    // ✅ 기존 차트 안전하게 제거
    safeDestroyChart('subjectAverageChart');
    
    const canvas = document.getElementById('subjectAverageChart');
    if (!canvas) {
        console.warn('subjectAverageChart canvas를 찾을 수 없습니다.');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    const labels = Object.keys(bySubject);
    const data = Object.values(bySubject).map(s => s.avgStandard.toFixed(2));
    
    charts.subjectAverageChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: '과목별 평균 표준점수',
                data: data,
                backgroundColor: 'rgba(118, 75, 162, 0.6)',
                borderColor: 'rgba(118, 75, 162, 1)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

function createGradeDistributionChart(overall) {
    // ✅ 기존 차트 안전하게 제거
    safeDestroyChart('gradeDistributionChart');
    
    const canvas = document.getElementById('gradeDistributionChart');
    if (!canvas) {
        console.warn('gradeDistributionChart canvas를 찾을 수 없습니다.');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    // 등급별 학생 수 계산
    const gradeCounts = new Array(9).fill(0);
    allStudentsData.forEach(student => {
        const gradeIndex = Math.min(Math.max(Math.floor(student.avgGrade) - 1, 0), 8);
        gradeCounts[gradeIndex]++;
    });
    
    charts.gradeDistributionChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['1등급', '2등급', '3등급', '4등급', '5등급', '6등급', '7등급', '8등급', '9등급'],
            datasets: [{
                data: gradeCounts,
                backgroundColor: [
                    'rgba(231, 76, 60, 0.8)',
                    'rgba(230, 126, 34, 0.8)',
                    'rgba(241, 196, 15, 0.8)',
                    'rgba(46, 204, 113, 0.8)',
                    'rgba(52, 152, 219, 0.8)',
                    'rgba(155, 89, 182, 0.8)',
                    'rgba(149, 165, 166, 0.8)',
                    'rgba(127, 140, 141, 0.8)',
                    'rgba(52, 73, 94, 0.8)'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true
        }
    });
}

function createClassComparisonChart(byClass) {
    // ✅ 기존 차트 안전하게 제거
    safeDestroyChart('classComparisonChart');
    
    const canvas = document.getElementById('classComparisonChart');
    if (!canvas) {
        console.warn('classComparisonChart canvas를 찾을 수 없습니다.');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    const labels = Object.keys(byClass).map(key => key.replace('-', '학년 ') + '반');
    
    charts.classComparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: '평균 백분위',
                    data: Object.values(byClass).map(c => c.avgPercentile.toFixed(2)),
                    backgroundColor: 'rgba(52, 152, 219, 0.6)',
                    borderColor: 'rgba(52, 152, 219, 1)',
                    borderWidth: 2
                },
                {
                    label: '평균 등급',
                    data: Object.values(byClass).map(c => c.avgGrade.toFixed(2)),
                    backgroundColor: 'rgba(155, 89, 182, 0.6)',
                    borderColor: 'rgba(155, 89, 182, 1)',
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            }
        }
    });
}

// ==========================================
// 학생별 분석
// ==========================================

function updateStudentFilters() {
    const gradeFilter = document.getElementById('gradeFilter');
    if (!gradeFilter) return;
    
    const grades = [...new Set(allStudentsData.map(s => s.grade))].sort();
    
    gradeFilter.innerHTML = '<option value="all">전체</option>';
    grades.forEach(g => {
        gradeFilter.innerHTML += `<option value="${g}">${g}학년</option>`;
    });
}

function updateFilters() {
    const gradeFilter = document.getElementById('gradeFilter');
    const classFilter = document.getElementById('classFilter');
    
    if (!gradeFilter || !classFilter) return;
    
    const selectedGrade = gradeFilter.value;
    
    // 반 필터 업데이트
    classFilter.innerHTML = '<option value="all">전체</option>';
    
    const filteredByGrade = selectedGrade === 'all' 
        ? allStudentsData 
        : allStudentsData.filter(s => s.grade == selectedGrade);
    
    const classes = [...new Set(filteredByGrade.map(s => s.class))].sort();
    classes.forEach(c => {
        classFilter.innerHTML += `<option value="${c}">${c}반</option>`;
    });
    
    updateNumberFilter();
}

function updateNumberFilter() {
    const gradeFilter = document.getElementById('gradeFilter');
    const classFilter = document.getElementById('classFilter');
    const numberFilter = document.getElementById('numberFilter');
    
    if (!gradeFilter || !classFilter || !numberFilter) return;
    
    const selectedGrade = gradeFilter.value;
    const selectedClass = classFilter.value;
    
    numberFilter.innerHTML = '<option value="">학생 선택</option>';
    
    let filtered = allStudentsData;
    if (selectedGrade !== 'all') filtered = filtered.filter(s => s.grade == selectedGrade);
    if (selectedClass !== 'all') filtered = filtered.filter(s => s.class == selectedClass);
    
    filtered.sort((a, b) => a.number - b.number).forEach((student, index) => {
        numberFilter.innerHTML += `<option value="${index}">${student.number}번 - ${student.name}</option>`;
    });
}

function updateStudentInfo() {
    const numberFilter = document.getElementById('numberFilter');
    const nameDisplay = document.getElementById('nameDisplay');
    
    if (!numberFilter || !nameDisplay) return;
    
    const index = numberFilter.value;
    if (index === '') {
        nameDisplay.value = '';
    } else {
        const gradeFilter = document.getElementById('gradeFilter');
        const classFilter = document.getElementById('classFilter');
        const selectedGrade = gradeFilter.value;
        const selectedClass = classFilter.value;
        
        let filtered = allStudentsData;
        if (selectedGrade !== 'all') filtered = filtered.filter(s => s.grade == selectedGrade);
        if (selectedClass !== 'all') filtered = filtered.filter(s => s.class == selectedClass);
        
        if (filtered[index]) {
            nameDisplay.value = filtered[index].name;
        }
    }
}

function displayStudentTable() {
    const container = document.getElementById('studentTable');
    if (!container) return;
    
    let html = '<table><thead><tr><th>학년</th><th>반</th><th>번호</th><th>이름</th><th>평균 백분위</th><th>평균 등급</th></tr></thead><tbody>';
    
    allStudentsData.forEach(student => {
        html += `
            <tr>
                <td>${student.grade}</td>
                <td>${student.class}</td>
                <td>${student.number}</td>
                <td>${student.name}</td>
                <td>${student.avgPercentile.toFixed(2)}</td>
                <td>${student.avgGrade.toFixed(2)}</td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function showDetailAnalysis() {
    alert('개인 상세 분석 기능은 구현 중입니다.');
}

function generateClassPdf() {
    alert('학급 전체 PDF 생성 기능은 구현 중입니다.');
}

// ==========================================
// 내보내기 기능
// ==========================================

function exportDatabase() {
    if (!allStudentsData || allStudentsData.length === 0) {
        alert('분석된 데이터가 없습니다.');
        return;
    }
    
    const exportData = allStudentsData.map(student => {
        const row = {
            '학년': student.grade,
            '반': student.class,
            '번호': student.number,
            '이름': student.name,
            '평균백분위': student.avgPercentile.toFixed(2),
            '평균표준점수': student.avgStandard.toFixed(2),
            '평균원점수': student.avgRaw.toFixed(2),
            '평균등급': student.avgGrade.toFixed(2)
        };
        
        // 과목별 점수 추가
        Object.keys(student.subjects).forEach(subjectName => {
            const subject = student.subjects[subjectName];
            row[`${subjectName}_원점수`] = subject.raw;
            row[`${subjectName}_표준점수`] = subject.standard;
            row[`${subjectName}_백분위`] = subject.percentile;
            row[`${subjectName}_등급`] = subject.grade;
        });
        
        return row;
    });
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '통합데이터');
    
    XLSX.writeFile(wb, '모의고사_통합데이터_' + new Date().toISOString().slice(0, 10) + '.xlsx');
}

function saveAsHtml() {
    const htmlContent = document.documentElement.outerHTML;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '모의고사_분석결과_' + new Date().toISOString().slice(0, 10) + '.html';
    a.click();
    URL.revokeObjectURL(url);
}

// ==========================================
// 탭 전환
// ==========================================

function switchTab(e) {
    const tab = e.target.dataset.tab;
    
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    e.target.classList.add('active');
    const tabContent = document.getElementById(tab + 'Tab');
    if (tabContent) tabContent.classList.add('active');
}

function switchSubTab(e) {
    const subtab = e.target.dataset.subtab;
    
    document.querySelectorAll('.sub-tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.sub-tab-content').forEach(content => content.classList.remove('active'));
    
    e.target.classList.add('active');
    const subTabContent = document.getElementById(subtab + 'View');
    if (subTabContent) subTabContent.classList.add('active');
}

// ==========================================
// UI 헬퍼
// ==========================================

function showLoading() {
    if (loadingOverlay) {
        loadingOverlay.style.display = 'flex';
    }
}

function hideLoading() {
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
}
