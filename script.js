class MockExamAnalyzer {
    constructor() {
        this.filesData = new Map();
        this.combinedData = null;
        this.selectedFiles = null;
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        const fileInput = document.getElementById('excelFiles');
        const analyzeBtn = document.getElementById('analyzeBtn');
        const exportCsvBtn = document.getElementById('exportCsvBtn');
        const exportHtmlBtn = document.getElementById('exportHtmlBtn');

        // 파일 업로드
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

        // 드래그 앤 드롭
        const uploadSection = document.querySelector('.file-input-wrapper');
        if (uploadSection) {
            const prevent = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
            const setDragState = (on) => {
                const fileLabel = uploadSection.querySelector('.file-input-label');
                if (fileLabel) fileLabel.classList.toggle('dragover', on);
            };

            uploadSection.addEventListener('dragenter', (ev) => { prevent(ev); setDragState(true); });
            uploadSection.addEventListener('dragover', (ev) => { prevent(ev); setDragState(true); });
            uploadSection.addEventListener('dragleave', (ev) => { prevent(ev); setDragState(false); });
            uploadSection.addEventListener('drop', (ev) => {
                prevent(ev);
                setDragState(false);
                const files = ev.dataTransfer.files;
                if (files.length > 0) {
                    fileInput.files = files;
                    this.handleFileSelect({ target: fileInput });
                }
            });
        }

        // 버튼 이벤트
        analyzeBtn.addEventListener('click', () => this.analyzeFiles());
        exportCsvBtn.addEventListener('click', () => this.exportToCSV());
        exportHtmlBtn.addEventListener('click', () => this.exportHTML());

        // 탭 전환
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e));
        });

        // 학생 필터
        document.getElementById('gradeSelect').addEventListener('change', () => this.updateClassFilter());
        document.getElementById('classSelect').addEventListener('change', () => this.updateStudentFilter());
        document.getElementById('studentSelect').addEventListener('change', () => this.updateStudentName());
        document.getElementById('studentNameSearch').addEventListener('input', (e) => this.searchStudentByName(e));

        // 학생 상세 분석
        document.getElementById('showStudentDetail').addEventListener('click', () => this.showStudentDetail());
        document.getElementById('pdfClassBtn').addEventListener('click', () => this.generateClassPDF());

        // 뷰 토글
        document.getElementById('tableViewBtn').addEventListener('click', () => this.switchView('table'));
        document.getElementById('detailViewBtn').addEventListener('click', () => this.switchView('detail'));

        // 학생 검색
        document.getElementById('studentSearch').addEventListener('input', (e) => this.filterStudentTable(e));
    }

    async handleFileSelect(e) {
        const files = Array.from(e.target.files);
        this.selectedFiles = files;

        const fileList = document.getElementById('fileList');
        fileList.innerHTML = '';
        
        if (files.length > 0) {
            fileList.style.display = 'block';
            files.forEach((file, index) => {
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
                fileItem.innerHTML = `
                    <span class="file-name">${file.name}</span>
                    <span class="file-size">(${(file.size / 1024).toFixed(2)} KB)</span>
                    <button class="remove-file" onclick="mockExamAnalyzer.removeFile(${index})">×</button>
                `;
                fileList.appendChild(fileItem);
            });
            document.getElementById('analyzeBtn').disabled = false;
        }
    }

    removeFile(index) {
        const dt = new DataTransfer();
        const files = Array.from(this.selectedFiles);
        files.splice(index, 1);
        files.forEach(file => dt.items.add(file));
        
        document.getElementById('excelFiles').files = dt.files;
        this.selectedFiles = files;
        this.handleFileSelect({ target: { files: dt.files } });

        if (files.length === 0) {
            document.getElementById('analyzeBtn').disabled = true;
        }
    }

    async analyzeFiles() {
        this.showLoading();
        this.filesData.clear();

        try {
            for (const file of this.selectedFiles) {
                const data = await this.parseExcelFile(file);
                this.filesData.set(file.name, data);
            }

            // 데이터 통합
            this.combineData();

            // 결과 표시
            this.displayResults();

            // 버튼 활성화
            document.getElementById('exportCsvBtn').disabled = false;
            document.getElementById('exportHtmlBtn').disabled = false;

            // 결과 섹션 표시
            document.getElementById('results').style.display = 'block';

            this.hideLoading();
        } catch (error) {
            this.hideLoading();
            this.showError('파일 분석 중 오류가 발생했습니다: ' + error.message);
        }
    }

    async parseExcelFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });

                    // DATA 시트 찾기
                    const dataSheet = workbook.Sheets['DATA'] || workbook.Sheets[workbook.SheetNames[0]];
                    if (!dataSheet) {
                        reject(new Error('DATA 시트를 찾을 수 없습니다.'));
                        return;
                    }

                    const rawData = XLSX.utils.sheet_to_json(dataSheet, { header: 1, defval: null });
                    const parsedData = this.parseStudentData(rawData);
                    resolve(parsedData);
                } catch (error) {
                    reject(error);
                }
            };

            reader.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'));
            reader.readAsArrayBuffer(file);
        });
    }

    parseStudentData(rawData) {
        const students = [];
        
        // 3행부터 학생 데이터 (1, 2행은 헤더)
        for (let i = 2; i < rawData.length; i++) {
            const row = rawData[i];
            if (!row || row.length === 0 || !row[0]) continue;

            const student = {
                grade: row[0],
                class: row[1],
                number: row[2],
                name: row[3],
                subjects: {
                    korean: {
                        name: '국어',
                        raw: row[5],
                        standard: row[6],
                        percentile: row[7],
                        grade: row[8]
                    },
                    math: {
                        name: '수학',
                        raw: row[10],
                        standard: row[11],
                        percentile: row[12],
                        grade: row[13]
                    },
                    english: {
                        name: '영어',
                        raw: row[15],
                        standard: row[16],
                        percentile: row[17],
                        grade: row[18]
                    },
                    inquiry1: {
                        name: row[20] || '탐구1',
                        raw: row[21],
                        standard: row[22],
                        percentile: row[23],
                        grade: row[24]
                    },
                    inquiry2: {
                        name: row[25] || '탐구2',
                        raw: row[26],
                        standard: row[27],
                        percentile: row[28],
                        grade: row[29]
                    },
                    inquiry3: {
                        name: row[30] || '탐구3',
                        raw: row[31],
                        standard: row[32],
                        percentile: row[33],
                        grade: row[34]
                    },
                    secondLang: {
                        name: row[35] || '제2외국어',
                        raw: row[36],
                        standard: row[37],
                        percentile: row[38],
                        grade: row[39]
                    }
                },
                total: {
                    raw: row[44],
                    standard: row[45],
                    percentile: row[46]
                }
            };

            students.push(student);
        }

        return students;
    }

    combineData() {
        const allStudents = [];
        
        for (const [fileName, students] of this.filesData.entries()) {
            allStudents.push(...students);
        }

        this.combinedData = {
            students: allStudents,
            totalCount: allStudents.length,
            examInfo: {
                name: '모의고사',
                date: new Date().toISOString().split('T')[0]
            }
        };
    }

    displayResults() {
        this.displayOverviewStats();
        this.displaySubjectAnalysis();
        this.displayClassAnalysis();
        this.displayStudentTable();
        this.updateStudentFilters();
    }

    displayOverviewStats() {
        const students = this.combinedData.students;

        // 전체 통계 계산
        const totalStudents = students.length;
        let totalPercentile = 0;
        let totalStandard = 0;
        let totalRaw = 0;

        students.forEach(student => {
            if (student.total.percentile) totalPercentile += student.total.percentile;
            if (student.total.standard) totalStandard += student.total.standard;
            if (student.total.raw) totalRaw += student.total.raw;
        });

        document.getElementById('totalStudents').textContent = totalStudents;
        document.getElementById('avgPercentile').textContent = (totalPercentile / totalStudents).toFixed(2);
        document.getElementById('avgStandard').textContent = (totalStandard / totalStudents).toFixed(2);
        document.getElementById('avgRaw').textContent = (totalRaw / totalStudents).toFixed(2);

        // 학급별 백분위 분포 차트
        this.createClassPercentileChart();

        // 영역별 평균 등급 차트
        this.createSubjectGradeChart();
    }

    createClassPercentileChart() {
        const students = this.combinedData.students;
        const classStat = {};

        students.forEach(student => {
            const key = `${student.class}반`;
            if (!classStat[key]) {
                classStat[key] = { count: 0, totalPercentile: 0 };
            }
            classStat[key].count++;
            if (student.total.percentile) {
                classStat[key].totalPercentile += student.total.percentile;
            }
        });

        const labels = Object.keys(classStat).sort();
        const data = labels.map(label => {
            const stat = classStat[label];
            return stat.count > 0 ? (stat.totalPercentile / stat.count).toFixed(2) : 0;
        });

        const ctx = document.getElementById('classPercentileChart');
        if (window.classPercentileChart) {
            window.classPercentileChart.destroy();
        }

        window.classPercentileChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: '평균 백분위',
                    data: data,
                    backgroundColor: 'rgba(102, 126, 234, 0.6)',
                    borderColor: 'rgba(102, 126, 234, 1)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: { display: true },
                    datalabels: {
                        anchor: 'end',
                        align: 'top',
                        formatter: (value) => value,
                        font: { weight: 'bold' }
                    }
                },
                scales: {
                    y: { beginAtZero: true, max: 100 }
                }
            },
            plugins: [ChartDataLabels]
        });
    }

    createSubjectGradeChart() {
        const students = this.combinedData.students;
        const subjects = ['korean', 'math', 'english'];
        const subjectNames = { korean: '국어', math: '수학', english: '영어' };
        const data = {};

        subjects.forEach(subj => {
            let totalGrade = 0;
            let count = 0;
            students.forEach(student => {
                if (student.subjects[subj].grade) {
                    totalGrade += student.subjects[subj].grade;
                    count++;
                }
            });
            data[subj] = count > 0 ? (totalGrade / count).toFixed(2) : 0;
        });

        const ctx = document.getElementById('subjectGradeChart');
        if (window.subjectGradeChart) {
            window.subjectGradeChart.destroy();
        }

        window.subjectGradeChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: subjects.map(s => subjectNames[s]),
                datasets: [{
                    label: '평균 등급',
                    data: subjects.map(s => data[s]),
                    backgroundColor: ['#e74c3c', '#3498db', '#2ecc71'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    datalabels: {
                        anchor: 'end',
                        align: 'right',
                        formatter: (value) => value,
                        font: { weight: 'bold' }
                    }
                },
                scales: {
                    x: { beginAtZero: true, max: 9 }
                }
            },
            plugins: [ChartDataLabels]
        });
    }

    displaySubjectAnalysis() {
        const students = this.combinedData.students;
        const subjects = ['korean', 'math', 'english'];
        const subjectNames = { korean: '국어', math: '수학', english: '영어' };

        let html = '<div class="subject-cards">';

        subjects.forEach(subj => {
            let totalRaw = 0, totalStandard = 0, totalPercentile = 0, totalGrade = 0;
            let count = 0;

            students.forEach(student => {
                const subject = student.subjects[subj];
                if (subject.raw) {
                    totalRaw += subject.raw;
                    totalStandard += subject.standard || 0;
                    totalPercentile += subject.percentile || 0;
                    totalGrade += subject.grade || 0;
                    count++;
                }
            });

            const avgRaw = count > 0 ? (totalRaw / count).toFixed(2) : 0;
            const avgStandard = count > 0 ? (totalStandard / count).toFixed(2) : 0;
            const avgPercentile = count > 0 ? (totalPercentile / count).toFixed(2) : 0;
            const avgGrade = count > 0 ? (totalGrade / count).toFixed(2) : 0;

            html += `
                <div class="subject-card">
                    <h3>${subjectNames[subj]}</h3>
                    <div class="subject-stat">
                        <span class="stat-label">평균 원점수:</span>
                        <span class="stat-value">${avgRaw}</span>
                    </div>
                    <div class="subject-stat">
                        <span class="stat-label">평균 표준점수:</span>
                        <span class="stat-value">${avgStandard}</span>
                    </div>
                    <div class="subject-stat">
                        <span class="stat-label">평균 백분위:</span>
                        <span class="stat-value">${avgPercentile}</span>
                    </div>
                    <div class="subject-stat">
                        <span class="stat-label">평균 등급:</span>
                        <span class="stat-value">${avgGrade}</span>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        document.getElementById('subjectAverages').innerHTML = html;

        // 과목별 비교 차트
        this.createSubjectCompareChart();
    }

    createSubjectCompareChart() {
        const students = this.combinedData.students;
        const subjects = ['korean', 'math', 'english'];
        const subjectNames = { korean: '국어', math: '수학', english: '영어' };
        const metrics = ['raw', 'standard', 'percentile'];
        const metricNames = { raw: '원점수', standard: '표준점수', percentile: '백분위' };

        const datasets = metrics.map((metric, idx) => {
            const colors = ['rgba(231, 76, 60, 0.6)', 'rgba(52, 152, 219, 0.6)', 'rgba(46, 204, 113, 0.6)'];
            const data = subjects.map(subj => {
                let total = 0, count = 0;
                students.forEach(student => {
                    if (student.subjects[subj][metric]) {
                        total += student.subjects[subj][metric];
                        count++;
                    }
                });
                return count > 0 ? (total / count).toFixed(2) : 0;
            });

            return {
                label: metricNames[metric],
                data: data,
                backgroundColor: colors[idx],
                borderColor: colors[idx].replace('0.6', '1'),
                borderWidth: 2
            };
        });

        const ctx = document.getElementById('subjectCompareChart');
        if (window.subjectCompareChart) {
            window.subjectCompareChart.destroy();
        }

        window.subjectCompareChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: subjects.map(s => subjectNames[s]),
                datasets: datasets
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { display: true }
                }
            }
        });
    }

    displayClassAnalysis() {
        const students = this.combinedData.students;
        const classStat = {};

        students.forEach(student => {
            const key = `${student.class}반`;
            if (!classStat[key]) {
                classStat[key] = {
                    count: 0,
                    totalRaw: 0,
                    totalStandard: 0,
                    totalPercentile: 0
                };
            }
            classStat[key].count++;
            if (student.total.raw) classStat[key].totalRaw += student.total.raw;
            if (student.total.standard) classStat[key].totalStandard += student.total.standard;
            if (student.total.percentile) classStat[key].totalPercentile += student.total.percentile;
        });

        let html = '<table><thead><tr><th>학급</th><th>학생 수</th><th>평균 원점수</th><th>평균 표준점수</th><th>평균 백분위</th></tr></thead><tbody>';

        Object.keys(classStat).sort().forEach(classKey => {
            const stat = classStat[classKey];
            const avgRaw = (stat.totalRaw / stat.count).toFixed(2);
            const avgStandard = (stat.totalStandard / stat.count).toFixed(2);
            const avgPercentile = (stat.totalPercentile / stat.count).toFixed(2);

            html += `
                <tr>
                    <td>${classKey}</td>
                    <td>${stat.count}</td>
                    <td>${avgRaw}</td>
                    <td>${avgStandard}</td>
                    <td>${avgPercentile}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        document.getElementById('classAnalysis').innerHTML = html;

        // 학급별 비교 차트
        this.createClassCompareChart();
    }

    createClassCompareChart() {
        const students = this.combinedData.students;
        const classStat = {};

        students.forEach(student => {
            const key = `${student.class}반`;
            if (!classStat[key]) {
                classStat[key] = { count: 0, totalStandard: 0 };
            }
            classStat[key].count++;
            if (student.total.standard) {
                classStat[key].totalStandard += student.total.standard;
            }
        });

        const labels = Object.keys(classStat).sort();
        const data = labels.map(label => {
            const stat = classStat[label];
            return stat.count > 0 ? (stat.totalStandard / stat.count).toFixed(2) : 0;
        });

        const ctx = document.getElementById('classCompareChart');
        if (window.classCompareChart) {
            window.classCompareChart.destroy();
        }

        window.classCompareChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '평균 표준점수',
                    data: data,
                    fill: false,
                    borderColor: 'rgba(102, 126, 234, 1)',
                    backgroundColor: 'rgba(102, 126, 234, 0.6)',
                    tension: 0.1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    datalabels: {
                        anchor: 'top',
                        align: 'top',
                        formatter: (value) => value
                    }
                }
            },
            plugins: [ChartDataLabels]
        });
    }

    displayStudentTable() {
        const students = this.combinedData.students;

        let html = '<table><thead><tr><th>학년</th><th>반</th><th>번호</th><th>이름</th><th>국어</th><th>수학</th><th>영어</th><th>총점</th><th>백분위</th></tr></thead><tbody>';

        students.forEach(student => {
            html += `
                <tr>
                    <td>${student.grade}</td>
                    <td>${student.class}</td>
                    <td>${student.number}</td>
                    <td>${student.name}</td>
                    <td>${student.subjects.korean.grade || '-'}</td>
                    <td>${student.subjects.math.grade || '-'}</td>
                    <td>${student.subjects.english.grade || '-'}</td>
                    <td>${student.total.raw || '-'}</td>
                    <td>${student.total.percentile ? student.total.percentile.toFixed(2) : '-'}</td>
                </tr>
            `;
        });

        html += '</tbody></table>';
        document.getElementById('studentTable').innerHTML = html;
    }

    updateStudentFilters() {
        const students = this.combinedData.students;

        // 학년 필터
        const grades = [...new Set(students.map(s => s.grade))].sort();
        const gradeSelect = document.getElementById('gradeSelect');
        gradeSelect.innerHTML = '<option value="">전체</option>';
        grades.forEach(g => {
            gradeSelect.innerHTML += `<option value="${g}">${g}학년</option>`;
        });
    }

    updateClassFilter() {
        const selectedGrade = document.getElementById('gradeSelect').value;
        const students = this.combinedData.students;

        const filtered = selectedGrade ? students.filter(s => s.grade == selectedGrade) : students;
        const classes = [...new Set(filtered.map(s => s.class))].sort();

        const classSelect = document.getElementById('classSelect');
        classSelect.innerHTML = '<option value="">전체</option>';
        classes.forEach(c => {
            classSelect.innerHTML += `<option value="${c}">${c}반</option>`;
        });

        this.updateStudentFilter();
    }

    updateStudentFilter() {
        const selectedGrade = document.getElementById('gradeSelect').value;
        const selectedClass = document.getElementById('classSelect').value;
        const students = this.combinedData.students;

        let filtered = students;
        if (selectedGrade) filtered = filtered.filter(s => s.grade == selectedGrade);
        if (selectedClass) filtered = filtered.filter(s => s.class == selectedClass);

        const studentSelect = document.getElementById('studentSelect');
        studentSelect.innerHTML = '<option value="">학생 선택</option>';
        filtered.forEach((s, idx) => {
            studentSelect.innerHTML += `<option value="${idx}">${s.number}번 ${s.name}</option>`;
        });

        this.filteredStudents = filtered;
        document.getElementById('showStudentDetail').disabled = true;
    }

    updateStudentName() {
        const index = document.getElementById('studentSelect').value;
        if (index !== '') {
            document.getElementById('showStudentDetail').disabled = false;
        } else {
            document.getElementById('showStudentDetail').disabled = true;
        }
    }

    searchStudentByName(e) {
        const query = e.target.value.toLowerCase();
        const students = this.combinedData.students;

        const filtered = students.filter(s => s.name.toLowerCase().includes(query));
        
        const studentSelect = document.getElementById('studentSelect');
        studentSelect.innerHTML = '<option value="">학생 선택</option>';
        filtered.forEach((s, idx) => {
            studentSelect.innerHTML += `<option value="${idx}">${s.grade}학년 ${s.class}반 ${s.number}번 ${s.name}</option>`;
        });

        this.filteredStudents = filtered;
    }

    showStudentDetail() {
        const index = document.getElementById('studentSelect').value;
        if (index === '') return;

        const student = this.filteredStudents[index];
        
        let html = `
            <div class="student-detail-card">
                <h3>${student.grade}학년 ${student.class}반 ${student.number}번 ${student.name}</h3>
                <div class="detail-section">
                    <h4>주요 과목</h4>
                    <table>
                        <thead>
                            <tr><th>과목</th><th>원점수</th><th>표준점수</th><th>백분위</th><th>등급</th></tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>국어</td>
                                <td>${student.subjects.korean.raw || '-'}</td>
                                <td>${student.subjects.korean.standard || '-'}</td>
                                <td>${student.subjects.korean.percentile || '-'}</td>
                                <td>${student.subjects.korean.grade || '-'}</td>
                            </tr>
                            <tr>
                                <td>수학</td>
                                <td>${student.subjects.math.raw || '-'}</td>
                                <td>${student.subjects.math.standard || '-'}</td>
                                <td>${student.subjects.math.percentile || '-'}</td>
                                <td>${student.subjects.math.grade || '-'}</td>
                            </tr>
                            <tr>
                                <td>영어</td>
                                <td>${student.subjects.english.raw || '-'}</td>
                                <td>${student.subjects.english.standard || '-'}</td>
                                <td>${student.subjects.english.percentile || '-'}</td>
                                <td>${student.subjects.english.grade || '-'}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <div class="detail-section">
                    <h4>총점</h4>
                    <p><strong>원점수:</strong> ${student.total.raw || '-'}</p>
                    <p><strong>표준점수:</strong> ${student.total.standard || '-'}</p>
                    <p><strong>백분위:</strong> ${student.total.percentile ? student.total.percentile.toFixed(2) : '-'}</p>
                </div>
            </div>
        `;

        document.getElementById('studentDetailContent').innerHTML = html;
        this.switchView('detail');
    }

    filterStudentTable(e) {
        const query = e.target.value.toLowerCase();
        const rows = document.querySelectorAll('#studentTable tbody tr');

        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(query) ? '' : 'none';
        });
    }

    switchTab(e) {
        const tab = e.target.dataset.tab;

        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        e.target.classList.add('active');
        document.getElementById(tab + '-tab').classList.add('active');
    }

    switchView(view) {
        if (view === 'table') {
            document.getElementById('tableView').style.display = 'block';
            document.getElementById('detailView').style.display = 'none';
            document.getElementById('tableViewBtn').classList.add('active');
            document.getElementById('detailViewBtn').classList.remove('active');
        } else {
            document.getElementById('tableView').style.display = 'none';
            document.getElementById('detailView').style.display = 'block';
            document.getElementById('tableViewBtn').classList.remove('active');
            document.getElementById('detailViewBtn').classList.add('active');
        }
    }

    async generateClassPDF() {
        alert('학급 전체 PDF 생성 기능은 구현 중입니다.');
    }

    exportToCSV() {
        const students = this.combinedData.students;

        const data = students.map(s => ({
            '학년': s.grade,
            '반': s.class,
            '번호': s.number,
            '이름': s.name,
            '국어_원점수': s.subjects.korean.raw,
            '국어_표준점수': s.subjects.korean.standard,
            '국어_백분위': s.subjects.korean.percentile,
            '국어_등급': s.subjects.korean.grade,
            '수학_원점수': s.subjects.math.raw,
            '수학_표준점수': s.subjects.math.standard,
            '수학_백분위': s.subjects.math.percentile,
            '수학_등급': s.subjects.math.grade,
            '영어_원점수': s.subjects.english.raw,
            '영어_표준점수': s.subjects.english.standard,
            '영어_백분위': s.subjects.english.percentile,
            '영어_등급': s.subjects.english.grade,
            '총점_원점수': s.total.raw,
            '총점_표준점수': s.total.standard,
            '총점_백분위': s.total.percentile
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, '성적데이터');

        const date = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `모의고사_성적분석_${date}.xlsx`);
    }

    exportHTML() {
        const htmlContent = document.documentElement.outerHTML;
        const blob = new Blob([htmlContent], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const date = new Date().toISOString().split('T')[0];
        a.download = `모의고사_성적분석_${date}.html`;
        a.click();
        URL.revokeObjectURL(url);
    }

    showLoading() {
        document.getElementById('loading').style.display = 'flex';
    }

    hideLoading() {
        document.getElementById('loading').style.display = 'none';
    }

    showError(message) {
        const errorDiv = document.getElementById('error');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }
}

// 인스턴스 생성
const mockExamAnalyzer = new MockExamAnalyzer();
