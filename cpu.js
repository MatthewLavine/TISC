/* ============================================================
   TISC — CPU Engine (Iteration 1)
   
   This file implements the core CPU simulation. Think of it as
   the "hardware" — the actual logic that makes the CPU tick.
   
   KEY CONCEPTS:
   
   1. REGISTERS: Tiny storage slots inside the CPU. They're the
      fastest memory a computer has — just a few bytes, but the
      CPU can access them in a single clock cycle.
      
      - PC (Program Counter): Holds the address of the NEXT
        instruction to execute. After each instruction, it
        automatically advances to point to the next one.
      
      - R0–R3: General-purpose registers. Programs use these to
        hold the values they're working with.
   
   2. INSTRUCTIONS: Each instruction is a small packet of data
      that tells the CPU what to do. We encode each instruction
      as an object with:
        - opcode: WHAT operation to perform
        - operands: WHAT data to use (register names, numbers)
   
   3. THE CYCLE: Every CPU in the world runs this loop:
      a) FETCH: Read the instruction at the address in PC
      b) DECODE: Parse the instruction to understand it
      c) EXECUTE: Perform the operation
      d) Advance PC (unless the instruction already changed it)
      e) Repeat
   ============================================================ */

/**
 * Instruction opcodes for our CPU.
 * 
 * In a real CPU, these would be binary numbers (like 0x01, 0x02).
 * We use strings here for readability, but the concept is the same:
 * each opcode is a unique identifier for an operation.
 */
const Opcode = Object.freeze({
    /** Load an immediate (literal) value into a register.
     *  Example: LOAD_IMM R0, 42  →  R0 = 42 */
    LOAD_IMM: 'LOAD_IMM',

    /** Add two registers and store the result in the first.
     *  Example: ADD R0, R1  →  R0 = R0 + R1 */
    ADD: 'ADD',

    /** Halt the CPU. No more instructions will execute. */
    HALT: 'HALT',
});

/**
 * The register names our CPU supports.
 * R0–R3 are general purpose, PC is the program counter.
 */
const Register = Object.freeze({
    PC: 'PC',
    R0: 'R0',
    R1: 'R1',
    R2: 'R2',
    R3: 'R3',
});

/**
 * Creates a single instruction object.
 * 
 * In a real CPU, instructions are encoded as binary numbers.
 * For example, on x86, `ADD EAX, EBX` might be encoded as
 * the bytes `01 D8`. Our CPU uses JavaScript objects instead
 * of raw bytes — same idea, just more human-readable.
 * 
 * @param {string} opcode - The operation to perform
 * @param {Array} operands - The arguments for the operation
 * @returns {Object} An instruction object
 */
function makeInstruction(opcode, ...operands) {
    return { opcode, operands };
}

/**
 * A collection of example programs.
 * 
 * Each program is an array of instructions. When the CPU runs,
 * it starts at address 0 (the first instruction) and works its
 * way through the array.
 */
const PROGRAMS = {
    'add-two-numbers': {
        name: 'Add Two Numbers',
        description: 'Loads 7 into R0 and 5 into R1, then adds them. Result (12) ends up in R0. This is the simplest possible program that does useful work.',
        instructions: [
            makeInstruction(Opcode.LOAD_IMM, Register.R0, 7),    // R0 = 7
            makeInstruction(Opcode.LOAD_IMM, Register.R1, 5),    // R1 = 5
            makeInstruction(Opcode.ADD, Register.R0, Register.R1), // R0 = R0 + R1 = 12
            makeInstruction(Opcode.HALT),                         // Stop
        ],
    },

    'sum-three': {
        name: 'Sum Three Values',
        description: 'Loads three values into R0, R1, and R2, then sums them step by step into R0. Shows how the CPU accumulates a result over multiple instructions.',
        instructions: [
            makeInstruction(Opcode.LOAD_IMM, Register.R0, 10),   // R0 = 10
            makeInstruction(Opcode.LOAD_IMM, Register.R1, 20),   // R1 = 20
            makeInstruction(Opcode.LOAD_IMM, Register.R2, 30),   // R2 = 30
            makeInstruction(Opcode.ADD, Register.R0, Register.R1), // R0 = R0 + R1 = 30
            makeInstruction(Opcode.ADD, Register.R0, Register.R2), // R0 = R0 + R2 = 60
            makeInstruction(Opcode.HALT),                         // Stop
        ],
    },

    'register-shuffle': {
        name: 'Register Shuffle',
        description: 'Loads values into all four registers and performs multiple additions. Watch how data flows between registers as instructions execute.',
        instructions: [
            makeInstruction(Opcode.LOAD_IMM, Register.R0, 1),    // R0 = 1
            makeInstruction(Opcode.LOAD_IMM, Register.R1, 2),    // R1 = 2
            makeInstruction(Opcode.LOAD_IMM, Register.R2, 3),    // R2 = 3
            makeInstruction(Opcode.LOAD_IMM, Register.R3, 4),    // R3 = 4
            makeInstruction(Opcode.ADD, Register.R0, Register.R1), // R0 = 1+2 = 3
            makeInstruction(Opcode.ADD, Register.R2, Register.R3), // R2 = 3+4 = 7
            makeInstruction(Opcode.ADD, Register.R0, Register.R2), // R0 = 3+7 = 10
            makeInstruction(Opcode.HALT),                         // Stop
        ],
    },
};

/**
 * The CPU class — the heart of the simulator.
 * 
 * This models a simplified CPU with:
 * - A set of registers (fast storage inside the CPU)
 * - A program (sequence of instructions in memory)
 * - A fetch-decode-execute cycle
 * 
 * Real CPUs are vastly more complex (pipelining, caches,
 * out-of-order execution, etc.) but the fundamental cycle
 * is exactly this.
 */
class CPU {
    constructor() {
        /** @type {Object<string, number>} The register file */
        this.registers = {
            [Register.PC]: 0,
            [Register.R0]: 0,
            [Register.R1]: 0,
            [Register.R2]: 0,
            [Register.R3]: 0,
        };

        /** @type {Array<Object>} The program loaded into instruction memory */
        this.program = [];

        /** @type {boolean} Whether the CPU has been halted */
        this.halted = false;

        /** @type {number} How many cycles the CPU has executed */
        this.cycleCount = 0;
    }

    /**
     * Load a program into instruction memory.
     * 
     * In a real computer, this is what happens when the OS loads
     * a program from disk into RAM. The program counter is set to
     * 0 (the beginning of the program).
     * 
     * @param {Array<Object>} instructions - The program to load
     */
    loadProgram(instructions) {
        this.program = [...instructions];
        this.reset();
    }

    /**
     * Reset the CPU to its initial state.
     * Like pressing the reset button on a real CPU.
     */
    reset() {
        for (const reg of Object.keys(this.registers)) {
            this.registers[reg] = 0;
        }
        this.halted = false;
        this.cycleCount = 0;
    }

    /**
     * Get the value of a register.
     * @param {string} reg - Register name
     * @returns {number} The register's current value
     */
    getRegister(reg) {
        return this.registers[reg];
    }

    /**
     * Set a register to a new value.
     * @param {string} reg - Register name
     * @param {number} value - The value to store
     */
    setRegister(reg, value) {
        this.registers[reg] = value;
    }

    /**
     * FETCH: Read the next instruction from memory.
     * 
     * The CPU looks at the Program Counter (PC) to know WHERE
     * in memory to read from. The instruction at that address
     * is "fetched" — pulled out of memory so the CPU can look
     * at it.
     * 
     * @returns {Object|null} The fetched instruction, or null if PC is out of bounds
     */
    fetch() {
        const pc = this.registers[Register.PC];

        if (pc < 0 || pc >= this.program.length) {
            return null;
        }

        return this.program[pc];
    }

    /**
     * DECODE: Parse an instruction to understand what it means.
     * 
     * In a real CPU, this involves reading the binary opcode
     * and figuring out which circuit to activate. In our
     * simulation, we just read the opcode string.
     * 
     * @param {Object} instruction - The fetched instruction
     * @returns {Object} Decoded information about the instruction
     */
    decode(instruction) {
        const { opcode, operands } = instruction;

        switch (opcode) {
            case Opcode.LOAD_IMM:
                return {
                    opcode,
                    description: `Load the value ${operands[1]} into register ${operands[0]}`,
                    assembly: `LOAD_IMM ${operands[0]}, ${operands[1]}`,
                    targetReg: operands[0],
                    value: operands[1],
                };

            case Opcode.ADD:
                return {
                    opcode,
                    description: `Add ${operands[0]} and ${operands[1]}, store result in ${operands[0]}`,
                    assembly: `ADD ${operands[0]}, ${operands[1]}`,
                    destReg: operands[0],
                    srcReg: operands[1],
                };

            case Opcode.HALT:
                return {
                    opcode,
                    description: 'Halt the CPU — stop executing',
                    assembly: 'HALT',
                };

            default:
                return {
                    opcode: 'UNKNOWN',
                    description: `Unknown opcode: ${opcode}`,
                    assembly: `??? ${opcode}`,
                };
        }
    }

    /**
     * EXECUTE: Perform the decoded operation.
     * 
     * This is where the CPU actually DOES the work — writing
     * values to registers, performing arithmetic, etc.
     * 
     * @param {Object} decoded - The decoded instruction info
     * @returns {Object} Execution result (what changed)
     */
    execute(decoded) {
        const result = {
            changedRegisters: [],
            details: '',
        };

        switch (decoded.opcode) {
            case Opcode.LOAD_IMM: {
                const { targetReg, value } = decoded;
                this.registers[targetReg] = value;
                result.changedRegisters.push(targetReg);
                result.details = `${targetReg} ← ${value}`;
                break;
            }

            case Opcode.ADD: {
                const { destReg, srcReg } = decoded;
                const a = this.registers[destReg];
                const b = this.registers[srcReg];
                const sum = a + b;
                this.registers[destReg] = sum;
                result.changedRegisters.push(destReg);
                result.details = `${destReg} ← ${a} + ${b} = ${sum}`;
                break;
            }

            case Opcode.HALT: {
                this.halted = true;
                result.details = 'CPU halted';
                break;
            }

            default:
                result.details = 'Unknown instruction — skipped';
                break;
        }

        return result;
    }

    /**
     * Run one complete CPU cycle: Fetch → Decode → Execute.
     * 
     * This is THE fundamental operation of every CPU ever made.
     * A modern CPU does this billions of times per second.
     * We do it one step at a time so you can see what's happening.
     * 
     * @returns {Object} A detailed log of what happened this cycle
     */
    step() {
        if (this.halted) {
            return { status: 'halted', message: 'CPU is halted. Reset to run again.' };
        }

        const pc = this.registers[Register.PC];
        this.cycleCount++;

        // ═══════════════════════════════════════
        // STEP 1: FETCH
        // ═══════════════════════════════════════
        const instruction = this.fetch();

        if (!instruction) {
            this.halted = true;
            return {
                status: 'error',
                message: `PC (${pc}) is out of bounds! No instruction at this address. CPU halted.`,
            };
        }

        // ═══════════════════════════════════════
        // STEP 2: DECODE
        // ═══════════════════════════════════════
        const decoded = this.decode(instruction);

        // ═══════════════════════════════════════
        // STEP 3: EXECUTE
        // ═══════════════════════════════════════
        const result = this.execute(decoded);

        // ═══════════════════════════════════════
        // ADVANCE THE PROGRAM COUNTER
        // ═══════════════════════════════════════
        // After executing, PC moves to the next instruction.
        // (In later iterations, jumps/branches will change PC differently.)
        if (!this.halted) {
            this.registers[Register.PC] = pc + 1;
            result.changedRegisters.push(Register.PC);
        }

        return {
            status: this.halted ? 'halted' : 'ok',
            cycle: this.cycleCount,
            pc,
            instruction,
            decoded,
            result,
        };
    }
}

// Export for use by app.js
// (We're using a simple script-based approach, so these become globals)
window.CPU = CPU;
window.Opcode = Opcode;
window.Register = Register;
window.PROGRAMS = PROGRAMS;
window.makeInstruction = makeInstruction;
