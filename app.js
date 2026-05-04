/* ============================================================
   TISC — App Controller (Iteration 3)
   
   Now includes:
   - RAM viewer showing a hex grid of memory contents
   - Visual highlighting of memory reads (cyan) and writes (green)
   - Flags panel with LED indicators
   ============================================================ */

(function () {
    'use strict';

    const cpu = new CPU();
    let isRunning = false;
    let runTimer = null;
    let currentProgramId = 'add-two-numbers';

    const dom = {
        // Registers
        regPC: document.getElementById('reg-pc-value'),
        regR0: document.getElementById('reg-r0-value'),
        regR1: document.getElementById('reg-r1-value'),
        regR2: document.getElementById('reg-r2-value'),
        regR3: document.getElementById('reg-r3-value'),
        regPCContainer: document.getElementById('reg-pc'),
        regR0Container: document.getElementById('reg-r0'),
        regR1Container: document.getElementById('reg-r1'),
        regR2Container: document.getElementById('reg-r2'),
        regR3Container: document.getElementById('reg-r3'),

        // Flags
        flagZ: document.getElementById('flag-z'),
        flagN: document.getElementById('flag-n'),
        flagC: document.getElementById('flag-c'),

        // Controls
        stepBtn: document.getElementById('step-btn'),
        runBtn: document.getElementById('run-btn'),
        resetBtn: document.getElementById('reset-btn'),
        speedSlider: document.getElementById('speed-slider'),
        speedLabel: document.getElementById('speed-label'),
        statusDot: document.getElementById('status-dot'),
        statusLabel: document.getElementById('status-label'),

        // Program
        programSelect: document.getElementById('program-select'),
        programDescription: document.getElementById('program-description'),

        // Memory
        memoryTbody: document.getElementById('memory-tbody'),

        // RAM
        ramViewer: document.getElementById('ram-viewer'),

        // Log
        logEntries: document.getElementById('log-entries'),
        clearLogBtn: document.getElementById('clear-log-btn'),

        // Concept toggle
        toggleConceptBtn: document.getElementById('toggle-concept-btn'),
        conceptContent: document.getElementById('concept-content'),
    };

    const regValueElements = {
        [Register.PC]: dom.regPC,
        [Register.R0]: dom.regR0,
        [Register.R1]: dom.regR1,
        [Register.R2]: dom.regR2,
        [Register.R3]: dom.regR3,
    };

    const regContainerElements = {
        [Register.PC]: dom.regPCContainer,
        [Register.R0]: dom.regR0Container,
        [Register.R1]: dom.regR1Container,
        [Register.R2]: dom.regR2Container,
        [Register.R3]: dom.regR3Container,
    };

    function init() {
        loadProgram(currentProgramId);
        bindEvents();
        updateUI();
    }

    function bindEvents() {
        dom.stepBtn.addEventListener('click', onStep);
        dom.runBtn.addEventListener('click', onToggleRun);
        dom.resetBtn.addEventListener('click', onReset);
        dom.speedSlider.addEventListener('input', onSpeedChange);
        dom.programSelect.addEventListener('change', onProgramChange);
        dom.clearLogBtn.addEventListener('click', onClearLog);
        dom.toggleConceptBtn.addEventListener('click', onToggleConcept);

        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
            switch (e.key) {
                case ' ':
                case 's':
                    e.preventDefault();
                    onStep();
                    break;
                case 'r':
                    e.preventDefault();
                    onToggleRun();
                    break;
                case 'Escape':
                    e.preventDefault();
                    onReset();
                    break;
            }
        });
    }

    function loadProgram(programId) {
        const program = PROGRAMS[programId];
        if (!program) return;

        currentProgramId = programId;
        cpu.loadProgram(program.instructions);
        dom.programDescription.textContent = program.description;
        renderMemoryTable();
        clearLog();
        addLogEntry('info', `Loaded program: <strong>${program.name}</strong>`);
        addLogEntry('info', 'Press <strong>Step</strong> or <strong>Run</strong> to begin.');
        updateUI();
    }

    // --- Memory Table ---
    function renderMemoryTable() {
        dom.memoryTbody.innerHTML = '';
        cpu.program.forEach((instruction, addr) => {
            const decoded = cpu.decode(instruction);
            const row = document.createElement('tr');
            row.dataset.addr = addr;

            const addrCell = document.createElement('td');
            addrCell.innerHTML = `<span class="cell-addr">${formatHex(addr, 2)}</span>`;
            row.appendChild(addrCell);

            const hexCell = document.createElement('td');
            hexCell.innerHTML = `<span class="cell-hex">${encodeInstructionHex(instruction)}</span>`;
            row.appendChild(hexCell);

            const asmCell = document.createElement('td');
            asmCell.innerHTML = `<span class="cell-asm">${decoded.assembly}</span>`;
            row.appendChild(asmCell);

            const explainCell = document.createElement('td');
            explainCell.innerHTML = `<span class="cell-explain">${decoded.description}</span>`;
            row.appendChild(explainCell);

            dom.memoryTbody.appendChild(row);
        });
        highlightCurrentInstruction();
    }

    function encodeInstructionHex(instr) {
        const opcodeMap = {
            'LOAD_IMM': 0x01, 'ADD': 0x02, 'SUB': 0x03,
            'AND': 0x04, 'OR': 0x05, 'XOR': 0x06,
            'NOT': 0x07, 'SHL': 0x08, 'SHR': 0x09,
            'STORE': 0x0A, 'LOAD': 0x0B,
            'HALT': 0xFF,
        };
        const regMap = { 'R0': 0, 'R1': 1, 'R2': 2, 'R3': 3 };
        const opByte = opcodeMap[instr.opcode] || 0x00;

        switch (instr.opcode) {
            case 'LOAD_IMM': {
                const reg = regMap[instr.operands[0]] || 0;
                const imm = instr.operands[1] & 0xFF;
                return `${formatHex(opByte)} ${formatHex(reg)} ${formatHex(imm)}`;
            }
            case 'ADD': case 'SUB': case 'AND': case 'OR': case 'XOR': {
                const dest = regMap[instr.operands[0]] || 0;
                const src = regMap[instr.operands[1]] || 0;
                return `${formatHex(opByte)} ${formatHex(dest)} ${formatHex(src)}`;
            }
            case 'NOT': case 'SHL': case 'SHR': {
                const dest = regMap[instr.operands[0]] || 0;
                return `${formatHex(opByte)} ${formatHex(dest)}`;
            }
            case 'STORE': case 'LOAD': {
                const reg = regMap[instr.operands[0]] || 0;
                const addr = instr.operands[1] & 0xFF;
                return `${formatHex(opByte)} ${formatHex(reg)} ${formatHex(addr)}`;
            }
            case 'HALT':
                return `${formatHex(opByte)}`;
            default:
                return '??';
        }
    }

    function formatHex(value, minDigits = 2) {
        return '0x' + value.toString(16).toUpperCase().padStart(minDigits, '0');
    }

    function highlightCurrentInstruction() {
        const rows = dom.memoryTbody.querySelectorAll('tr');
        const pc = cpu.getRegister(Register.PC);

        rows.forEach((row, idx) => {
            row.classList.remove('current-instruction');
            const existingMarker = row.querySelector('.pc-marker');
            if (existingMarker) existingMarker.remove();

            if (idx === pc && !cpu.halted) {
                row.classList.add('current-instruction');
                const addrCell = row.querySelector('td:first-child');
                const marker = document.createElement('span');
                marker.className = 'pc-marker';
                marker.textContent = '▶ ';
                addrCell.prepend(marker);
            }

            if (idx < pc) {
                row.classList.add('executed');
            } else {
                row.classList.remove('executed');
            }
        });
    }

    // --- RAM Viewer ---
    /**
     * Render the RAM viewer as a simple vertical list.
     * Shows each non-zero address with its value — much clearer
     * than a hex grid for understanding how memory works.
     */
    function renderRamViewer(changedAddresses, readAddresses) {
        // Collect all addresses worth showing
        const entries = [];
        for (let i = 0; i < RAM_SIZE; i++) {
            if (cpu.ram[i] !== 0) {
                entries.push(i);
            }
        }

        // Also include recently changed/read addresses even if zero
        (changedAddresses || []).forEach(a => {
            if (!entries.includes(a)) entries.push(a);
        });
        (readAddresses || []).forEach(a => {
            if (!entries.includes(a)) entries.push(a);
        });
        entries.sort((a, b) => a - b);

        if (entries.length === 0) {
            dom.ramViewer.innerHTML = '<div class="ram-empty">RAM is empty. Use STORE to write data.</div>';
            return;
        }

        let html = '<table class="ram-table">';
        html += '<thead><tr><th>Address</th><th>Value (dec)</th><th>Value (hex)</th><th></th></tr></thead>';
        html += '<tbody>';

        for (const addr of entries) {
            const val = cpu.ram[addr];
            const isChanged = (changedAddresses || []).includes(addr);
            const isRead = (readAddresses || []).includes(addr);

            let rowClass = 'ram-row';
            let badge = '';
            if (isChanged) {
                rowClass += ' ram-row-written';
                badge = '<span class="ram-badge ram-badge-write">WRITE</span>';
            } else if (isRead) {
                rowClass += ' ram-row-read';
                badge = '<span class="ram-badge ram-badge-read">READ</span>';
            }

            html += `<tr class="${rowClass}">`;
            html += `<td class="ram-addr">${formatHex(addr, 2)}</td>`;
            html += `<td class="ram-val-dec">${val}</td>`;
            html += `<td class="ram-val-hex">${val.toString(16).toUpperCase().padStart(2, '0')}</td>`;
            html += `<td class="ram-action">${badge}</td>`;
            html += '</tr>';
        }

        html += '</tbody></table>';
        dom.ramViewer.innerHTML = html;
    }

    // --- UI Updates ---
    function updateUI() {
        for (const [reg, el] of Object.entries(regValueElements)) {
            el.textContent = cpu.getRegister(reg);
        }

        updateFlagsUI();
        renderRamViewer(cpu.ramChanges);

        if (cpu.halted) {
            dom.statusDot.className = 'status-dot halted';
            dom.statusLabel.textContent = 'Halted';
            dom.stepBtn.disabled = true;
            dom.runBtn.disabled = true;
            if (isRunning) stopRunning();
        } else if (isRunning) {
            dom.statusDot.className = 'status-dot running';
            dom.statusLabel.textContent = `Running (cycle ${cpu.cycleCount})`;
            dom.stepBtn.disabled = true;
        } else {
            dom.statusDot.className = 'status-dot';
            dom.statusLabel.textContent = cpu.cycleCount === 0 ? 'Ready' : `Paused (cycle ${cpu.cycleCount})`;
            dom.stepBtn.disabled = false;
            dom.runBtn.disabled = false;
        }

        dom.runBtn.innerHTML = isRunning
            ? '<span class="btn-icon">⏸</span> Pause'
            : '<span class="btn-icon">▶</span> Run';

        highlightCurrentInstruction();
    }

    function updateFlagsUI() {
        dom.flagZ.classList.toggle('active', cpu.flags.Z);
        dom.flagN.classList.toggle('active', cpu.flags.N);
        dom.flagC.classList.toggle('active', cpu.flags.C);
    }

    function flashRegisters(changedRegs) {
        for (const reg of changedRegs) {
            const container = regContainerElements[reg];
            if (container) {
                container.classList.remove('changed');
                void container.offsetWidth;
                container.classList.add('changed');
                setTimeout(() => container.classList.remove('changed'), 600);
            }
        }
    }

    // --- Logging ---
    function addLogEntry(type, html) {
        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;
        const badgeText = type.toUpperCase();
        entry.innerHTML = `<span class="log-badge">${badgeText}</span> ${html}`;
        dom.logEntries.appendChild(entry);
        dom.logEntries.scrollTop = dom.logEntries.scrollHeight;
    }

    function clearLog() {
        dom.logEntries.innerHTML = '';
    }

    function flagsSummary() {
        const parts = [];
        if (cpu.flags.Z) parts.push('Z=1');
        if (cpu.flags.N) parts.push('N=1');
        if (cpu.flags.C) parts.push('C=1');
        return parts.length > 0
            ? ` → flags: <code>${parts.join(', ')}</code>`
            : ' → flags: <code>all clear</code>';
    }

    // --- Event Handlers ---
    function onStep() {
        if (cpu.halted) return;

        const pc = cpu.getRegister(Register.PC);
        const instruction = cpu.program[pc];
        if (!instruction) {
            addLogEntry('halt', 'PC out of bounds — no instruction to fetch!');
            cpu.halted = true;
            updateUI();
            return;
        }

        const decoded = cpu.decode(instruction);
        addLogEntry('fetch', `<strong>Fetch</strong> from <code>${formatHex(pc, 2)}</code>: <code>${decoded.assembly}</code>`);

        setTimeout(() => {
            addLogEntry('decode', `<strong>Decode</strong>: ${decoded.description}`);

            setTimeout(() => {
                const stepResult = cpu.step();

                if (stepResult.status === 'halted' && stepResult.result) {
                    addLogEntry('execute', `<strong>Execute</strong>: ${stepResult.result.details}`);
                    addLogEntry('halt', `CPU halted after <strong>${cpu.cycleCount}</strong> cycles.`);
                    flashRegisters(stepResult.result.changedRegisters || []);
                } else if (stepResult.status === 'ok') {
                    let logMsg = `<strong>Execute</strong>: ${stepResult.result.details}`;
                    if (stepResult.result.flagsChanged) logMsg += flagsSummary();
                    const logType = stepResult.result.memoryChanged ? 'memory' : 'execute';
                    addLogEntry(logType, logMsg);
                    flashRegisters(stepResult.result.changedRegisters);

                    // For LOAD instructions, highlight the read address
                    if (decoded.opcode === 'LOAD') {
                        renderRamViewer([], [decoded.address & 0xFF]);
                    }
                } else {
                    addLogEntry('halt', stepResult.message);
                }

                updateUI();
            }, isRunning ? 0 : 120);
        }, isRunning ? 0 : 120);
    }

    function onToggleRun() {
        if (cpu.halted) return;
        if (isRunning) { stopRunning(); } else { startRunning(); }
        updateUI();
    }

    function startRunning() {
        isRunning = true;
        const speed = parseInt(dom.speedSlider.value);
        const interval = Math.max(100, 1000 / speed);
        runTimer = setInterval(() => {
            if (cpu.halted) { stopRunning(); updateUI(); return; }
            onStep();
        }, interval);
        updateUI();
    }

    function stopRunning() {
        isRunning = false;
        if (runTimer) { clearInterval(runTimer); runTimer = null; }
        updateUI();
    }

    function onReset() { stopRunning(); loadProgram(currentProgramId); }

    function onSpeedChange() {
        const speed = parseInt(dom.speedSlider.value);
        dom.speedLabel.textContent = `${speed} Hz`;
        if (isRunning) { stopRunning(); startRunning(); }
    }

    function onProgramChange() {
        stopRunning();
        loadProgram(dom.programSelect.value);
    }

    function onClearLog() {
        clearLog();
        addLogEntry('info', 'Log cleared.');
    }

    function onToggleConcept() {
        const content = dom.conceptContent;
        const btn = dom.toggleConceptBtn;
        if (content.style.display === 'none') {
            content.style.display = '';
            btn.textContent = '▼';
        } else {
            content.style.display = 'none';
            btn.textContent = '▶';
        }
    }

    init();
})();
