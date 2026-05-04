/* ============================================================
   TISC — App Controller (Iteration 1)
   
   This file connects the CPU engine (cpu.js) to the UI.
   Think of it as the "front panel" of our computer — the
   buttons, lights, and displays that let you see and control
   what the CPU is doing.
   ============================================================ */

(function () {
    'use strict';

    // --- State ---
    const cpu = new CPU();
    let isRunning = false;
    let runTimer = null;
    let currentProgramId = 'add-two-numbers';

    // --- DOM References ---
    const dom = {
        // Registers
        regPC: document.getElementById('reg-pc-value'),
        regR0: document.getElementById('reg-r0-value'),
        regR1: document.getElementById('reg-r1-value'),
        regR2: document.getElementById('reg-r2-value'),
        regR3: document.getElementById('reg-r3-value'),

        // Register containers (for animation)
        regPCContainer: document.getElementById('reg-pc'),
        regR0Container: document.getElementById('reg-r0'),
        regR1Container: document.getElementById('reg-r1'),
        regR2Container: document.getElementById('reg-r2'),
        regR3Container: document.getElementById('reg-r3'),

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

        // Log
        logEntries: document.getElementById('log-entries'),
        clearLogBtn: document.getElementById('clear-log-btn'),

        // Concept diagram
        cycleFetch: document.getElementById('cycle-fetch'),
        cycleDecode: document.getElementById('cycle-decode'),
        cycleExecute: document.getElementById('cycle-execute'),

        // Concept toggle
        toggleConceptBtn: document.getElementById('toggle-concept-btn'),
        conceptContent: document.getElementById('concept-content'),
    };

    // Map register names to DOM elements
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

    // --- Initialization ---
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

        // Keyboard shortcuts
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

    // --- Program Loading ---
    function loadProgram(programId) {
        const program = PROGRAMS[programId];
        if (!program) return;

        currentProgramId = programId;
        cpu.loadProgram(program.instructions);
        dom.programDescription.textContent = program.description;
        renderMemoryTable();
        clearLog();
        addLogEntry('info', `Loaded program: <strong>${program.name}</strong>`);
        addLogEntry('info', 'CPU initialized. Press <strong>Step</strong> or <strong>Run</strong> to begin.');
        updateUI();
    }

    // --- Memory Table Rendering ---
    function renderMemoryTable() {
        dom.memoryTbody.innerHTML = '';

        cpu.program.forEach((instruction, addr) => {
            const decoded = cpu.decode(instruction);
            const row = document.createElement('tr');
            row.dataset.addr = addr;

            // Address cell
            const addrCell = document.createElement('td');
            addrCell.innerHTML = `<span class="cell-addr">${formatHex(addr, 2)}</span>`;
            row.appendChild(addrCell);

            // Hex representation (simplified)
            const hexCell = document.createElement('td');
            hexCell.innerHTML = `<span class="cell-hex">${encodeInstructionHex(instruction)}</span>`;
            row.appendChild(hexCell);

            // Assembly representation
            const asmCell = document.createElement('td');
            asmCell.innerHTML = `<span class="cell-asm">${decoded.assembly}</span>`;
            row.appendChild(asmCell);

            // Human-readable explanation
            const explainCell = document.createElement('td');
            explainCell.innerHTML = `<span class="cell-explain">${decoded.description}</span>`;
            row.appendChild(explainCell);

            dom.memoryTbody.appendChild(row);
        });

        highlightCurrentInstruction();
    }

    /**
     * Encode an instruction as a hex string.
     * 
     * This is a simplified version of what real CPUs do. In a real
     * machine, each instruction is encoded as one or more bytes with
     * specific bit fields for the opcode, register numbers, and
     * immediate values.
     */
    function encodeInstructionHex(instr) {
        const opcodeMap = { 'LOAD_IMM': 0x01, 'ADD': 0x02, 'HALT': 0xFF };
        const regMap = { 'R0': 0, 'R1': 1, 'R2': 2, 'R3': 3 };

        const opByte = opcodeMap[instr.opcode] || 0x00;

        switch (instr.opcode) {
            case 'LOAD_IMM': {
                const reg = regMap[instr.operands[0]] || 0;
                const imm = instr.operands[1] & 0xFF;
                return `${formatHex(opByte)} ${formatHex(reg)} ${formatHex(imm)}`;
            }
            case 'ADD': {
                const dest = regMap[instr.operands[0]] || 0;
                const src = regMap[instr.operands[1]] || 0;
                return `${formatHex(opByte)} ${formatHex(dest)} ${formatHex(src)}`;
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
            // Remove existing PC marker
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

    // --- UI Updates ---
    function updateUI() {
        // Update register values
        for (const [reg, el] of Object.entries(regValueElements)) {
            el.textContent = cpu.getRegister(reg);
        }

        // Update status
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

        // Update run button text
        dom.runBtn.innerHTML = isRunning
            ? '<span class="btn-icon">⏸</span> Pause'
            : '<span class="btn-icon">▶</span> Run';

        highlightCurrentInstruction();
    }

    /**
     * Flash the registers that changed to draw attention to them.
     */
    function flashRegisters(changedRegs) {
        for (const reg of changedRegs) {
            const container = regContainerElements[reg];
            if (container) {
                container.classList.remove('changed');
                // Trigger reflow to restart animation
                void container.offsetWidth;
                container.classList.add('changed');
                setTimeout(() => container.classList.remove('changed'), 600);
            }
        }
    }

    /**
     * Animate the fetch-decode-execute diagram to show which
     * phase is active.
     */
    function animateCycleDiagram(phase) {
        dom.cycleFetch.classList.remove('active');
        dom.cycleDecode.classList.remove('active');
        dom.cycleExecute.classList.remove('active');

        switch (phase) {
            case 'fetch': dom.cycleFetch.classList.add('active'); break;
            case 'decode': dom.cycleDecode.classList.add('active'); break;
            case 'execute': dom.cycleExecute.classList.add('active'); break;
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

    // --- Event Handlers ---

    /**
     * Execute one complete CPU cycle with animated phases.
     */
    function onStep() {
        if (cpu.halted) return;

        const pc = cpu.getRegister(Register.PC);

        // Phase 1: Fetch
        animateCycleDiagram('fetch');
        const instruction = cpu.program[pc];
        if (!instruction) {
            addLogEntry('halt', 'PC out of bounds — no instruction to fetch!');
            cpu.halted = true;
            updateUI();
            return;
        }
        const decoded = cpu.decode(instruction);
        addLogEntry('fetch', `<strong>Fetch</strong> from address <code>${formatHex(pc, 2)}</code>: got instruction <code>${decoded.assembly}</code>`);

        // Phase 2: Decode (small delay for visual effect)
        setTimeout(() => {
            animateCycleDiagram('decode');
            addLogEntry('decode', `<strong>Decode</strong>: ${decoded.description}`);

            // Phase 3: Execute
            setTimeout(() => {
                animateCycleDiagram('execute');
                const stepResult = cpu.step();

                if (stepResult.status === 'halted' && stepResult.result) {
                    addLogEntry('execute', `<strong>Execute</strong>: ${stepResult.result.details}`);
                    addLogEntry('halt', `CPU halted after <strong>${cpu.cycleCount}</strong> cycles.`);
                    flashRegisters(stepResult.result.changedRegisters || []);
                } else if (stepResult.status === 'ok') {
                    addLogEntry('execute', `<strong>Execute</strong>: ${stepResult.result.details}`);
                    flashRegisters(stepResult.result.changedRegisters);
                } else if (stepResult.status === 'halted') {
                    addLogEntry('halt', stepResult.message);
                } else {
                    addLogEntry('halt', stepResult.message);
                }

                updateUI();

                // Clear cycle highlight after a moment
                setTimeout(() => animateCycleDiagram(null), 300);
            }, isRunning ? 0 : 120);
        }, isRunning ? 0 : 120);
    }

    function onToggleRun() {
        if (cpu.halted) return;

        if (isRunning) {
            stopRunning();
        } else {
            startRunning();
        }
        updateUI();
    }

    function startRunning() {
        isRunning = true;
        const speed = parseInt(dom.speedSlider.value);
        const interval = Math.max(100, 1000 / speed);

        runTimer = setInterval(() => {
            if (cpu.halted) {
                stopRunning();
                updateUI();
                return;
            }
            onStep();
        }, interval);

        updateUI();
    }

    function stopRunning() {
        isRunning = false;
        if (runTimer) {
            clearInterval(runTimer);
            runTimer = null;
        }
        updateUI();
    }

    function onReset() {
        stopRunning();
        loadProgram(currentProgramId);
    }

    function onSpeedChange() {
        const speed = parseInt(dom.speedSlider.value);
        dom.speedLabel.textContent = `${speed} Hz`;

        // If currently running, restart with new speed
        if (isRunning) {
            stopRunning();
            startRunning();
        }
    }

    function onProgramChange() {
        const programId = dom.programSelect.value;
        stopRunning();
        loadProgram(programId);
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

    // --- Kick it off ---
    init();
})();
