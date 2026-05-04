/* ============================================================
   TISC — CPU Engine (Iteration 2)
   
   This file implements the core CPU simulation.
   
   KEY CONCEPTS (New in Iteration 2):
   
   4. THE ALU (Arithmetic Logic Unit):
      The ALU is the CPU's calculator. It's a physical circuit
      that takes two inputs and produces one output plus "flags"
      that describe the result. Every math and logic operation
      goes through the ALU.
      
   5. FLAGS REGISTER:
      After every ALU operation, the CPU sets special single-bit
      "flags" that describe the result:
      
      - Zero (Z): Was the result exactly 0?
      - Negative (N): Was the result negative? (top bit = 1)
      - Carry (C): Did the operation overflow past 8 bits?
      
      These flags are CRITICAL — in Iteration 4, we'll use them
      to make decisions (if/else) and loops. Without flags, a CPU
      can only run straight-line code.
   ============================================================ */

const Opcode = Object.freeze({
    // --- Iteration 1 ---
    LOAD_IMM: 'LOAD_IMM',
    ADD: 'ADD',
    HALT: 'HALT',

    // --- Iteration 2: ALU operations ---
    /** Subtract: dest = dest - src */
    SUB: 'SUB',
    /** Bitwise AND: dest = dest & src (keeps only bits that are 1 in BOTH) */
    AND: 'AND',
    /** Bitwise OR: dest = dest | src (keeps bits that are 1 in EITHER) */
    OR: 'OR',
    /** Bitwise XOR: dest = dest ^ src (keeps bits that differ) */
    XOR: 'XOR',
    /** Bitwise NOT: dest = ~dest (flips every bit) */
    NOT: 'NOT',
    /** Shift Left: dest = dest << 1 (multiply by 2) */
    SHL: 'SHL',
    /** Shift Right: dest = dest >> 1 (divide by 2) */
    SHR: 'SHR',
});

const Register = Object.freeze({
    PC: 'PC',
    R0: 'R0',
    R1: 'R1',
    R2: 'R2',
    R3: 'R3',
});

function makeInstruction(opcode, ...operands) {
    return { opcode, operands };
}

/**
 * The FLAGS object — describes the result of ALU operations.
 * 
 * In a real CPU (like x86), these are individual bits inside a
 * special register called EFLAGS or RFLAGS. ARM calls it CPSR.
 * We model them as separate booleans for clarity.
 */
function makeFlags() {
    return {
        Z: false,  // Zero flag: result was 0
        N: false,  // Negative flag: result's high bit was 1
        C: false,  // Carry flag: unsigned overflow occurred
    };
}

const PROGRAMS = {
    'add-two-numbers': {
        name: 'Add Two Numbers',
        description: 'Loads 7 into R0 and 5 into R1, then adds them. Result (12) ends up in R0.',
        instructions: [
            makeInstruction(Opcode.LOAD_IMM, Register.R0, 7),
            makeInstruction(Opcode.LOAD_IMM, Register.R1, 5),
            makeInstruction(Opcode.ADD, Register.R0, Register.R1),
            makeInstruction(Opcode.HALT),
        ],
    },

    'sum-three': {
        name: 'Sum Three Values',
        description: 'Loads three values and sums them step by step into R0. Watch the flags update after each ALU operation.',
        instructions: [
            makeInstruction(Opcode.LOAD_IMM, Register.R0, 10),
            makeInstruction(Opcode.LOAD_IMM, Register.R1, 20),
            makeInstruction(Opcode.LOAD_IMM, Register.R2, 30),
            makeInstruction(Opcode.ADD, Register.R0, Register.R1),
            makeInstruction(Opcode.ADD, Register.R0, Register.R2),
            makeInstruction(Opcode.HALT),
        ],
    },

    'register-shuffle': {
        name: 'Register Shuffle',
        description: 'Loads values into all four registers and performs multiple additions.',
        instructions: [
            makeInstruction(Opcode.LOAD_IMM, Register.R0, 1),
            makeInstruction(Opcode.LOAD_IMM, Register.R1, 2),
            makeInstruction(Opcode.LOAD_IMM, Register.R2, 3),
            makeInstruction(Opcode.LOAD_IMM, Register.R3, 4),
            makeInstruction(Opcode.ADD, Register.R0, Register.R1),
            makeInstruction(Opcode.ADD, Register.R2, Register.R3),
            makeInstruction(Opcode.ADD, Register.R0, Register.R2),
            makeInstruction(Opcode.HALT),
        ],
    },

    // --- New Iteration 2 programs ---
    'subtract-to-zero': {
        name: 'Subtract to Zero',
        description: 'Subtracts equal values to get zero. Watch the Zero flag (Z) turn ON when the result hits 0 — this is how CPUs detect equality!',
        instructions: [
            makeInstruction(Opcode.LOAD_IMM, Register.R0, 42),
            makeInstruction(Opcode.LOAD_IMM, Register.R1, 42),
            makeInstruction(Opcode.SUB, Register.R0, Register.R1),
            makeInstruction(Opcode.HALT),
        ],
    },

    'bitwise-masking': {
        name: 'Bitwise Masking',
        description: 'Uses AND to "mask" (extract) specific bits. Loads 0b11011010 (218) and masks with 0b00001111 (15) to extract the lower 4 bits → result is 0b00001010 (10).',
        instructions: [
            makeInstruction(Opcode.LOAD_IMM, Register.R0, 218),  // 11011010
            makeInstruction(Opcode.LOAD_IMM, Register.R1, 15),   // 00001111
            makeInstruction(Opcode.AND, Register.R0, Register.R1), // 00001010 = 10
            makeInstruction(Opcode.HALT),
        ],
    },

    'shift-multiply': {
        name: 'Shift = Multiply/Divide',
        description: 'Shifting left multiplies by 2, shifting right divides by 2. Loads 3, shifts left twice (3→6→12), then right once (12→6). This is how CPUs do fast powers-of-two math!',
        instructions: [
            makeInstruction(Opcode.LOAD_IMM, Register.R0, 3),
            makeInstruction(Opcode.SHL, Register.R0),           // 3 << 1 = 6
            makeInstruction(Opcode.SHL, Register.R0),           // 6 << 1 = 12
            makeInstruction(Opcode.SHR, Register.R0),           // 12 >> 1 = 6
            makeInstruction(Opcode.HALT),
        ],
    },

    'xor-swap': {
        name: 'XOR Swap Trick',
        description: 'Swaps two values WITHOUT a temp variable using the XOR swap trick (a classic bit-manipulation hack). R0=15, R1=27 → after 3 XORs → R0=27, R1=15.',
        instructions: [
            makeInstruction(Opcode.LOAD_IMM, Register.R0, 15),
            makeInstruction(Opcode.LOAD_IMM, Register.R1, 27),
            makeInstruction(Opcode.XOR, Register.R0, Register.R1), // R0 = R0 ^ R1
            makeInstruction(Opcode.XOR, Register.R1, Register.R0), // R1 = R1 ^ R0 = original R0
            makeInstruction(Opcode.XOR, Register.R0, Register.R1), // R0 = R0 ^ R1 = original R1
            makeInstruction(Opcode.HALT),
        ],
    },

    'not-complement': {
        name: 'NOT (Bitwise Complement)',
        description: 'NOT flips every bit. Loads 0 and NOTs it to get 255 (all 1s in 8 bits). Then NOTs 170 (10101010) to get 85 (01010101).',
        instructions: [
            makeInstruction(Opcode.LOAD_IMM, Register.R0, 0),
            makeInstruction(Opcode.NOT, Register.R0),            // ~0 = 255
            makeInstruction(Opcode.LOAD_IMM, Register.R1, 170),  // 10101010
            makeInstruction(Opcode.NOT, Register.R1),             // 01010101 = 85
            makeInstruction(Opcode.HALT),
        ],
    },
};

class CPU {
    constructor() {
        this.registers = {
            [Register.PC]: 0,
            [Register.R0]: 0,
            [Register.R1]: 0,
            [Register.R2]: 0,
            [Register.R3]: 0,
        };

        /**
         * The FLAGS register — NEW in Iteration 2.
         * 
         * After every ALU operation, these flags are automatically
         * updated to describe the result. They're like indicator
         * lights on the ALU's output.
         */
        this.flags = makeFlags();

        this.program = [];
        this.halted = false;
        this.cycleCount = 0;
    }

    loadProgram(instructions) {
        this.program = [...instructions];
        this.reset();
    }

    reset() {
        for (const reg of Object.keys(this.registers)) {
            this.registers[reg] = 0;
        }
        this.flags = makeFlags();
        this.halted = false;
        this.cycleCount = 0;
    }

    getRegister(reg) {
        return this.registers[reg];
    }

    setRegister(reg, value) {
        this.registers[reg] = value;
    }

    /**
     * Update flags based on an ALU result.
     * 
     * In a real CPU, the ALU hardware does this automatically
     * as a side effect of every operation. The flags are wired
     * directly to the ALU's output lines.
     * 
     * We work in 8-bit unsigned (0–255) to keep things simple.
     * 
     * @param {number} result - The raw result (may be > 255 or < 0)
     * @returns {number} The result masked to 8 bits
     */
    updateFlags(result) {
        // Carry: did the result exceed 8 bits (unsigned overflow)?
        this.flags.C = result > 255 || result < 0;

        // Mask to 8 bits (like real 8-bit hardware)
        const masked = result & 0xFF;

        // Zero: is the 8-bit result exactly 0?
        this.flags.Z = masked === 0;

        // Negative: is the top bit (bit 7) set?
        // In two's complement, this means the value is negative
        // when interpreted as a signed number.
        this.flags.N = (masked & 0x80) !== 0;

        return masked;
    }

    fetch() {
        const pc = this.registers[Register.PC];
        if (pc < 0 || pc >= this.program.length) return null;
        return this.program[pc];
    }

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

            case Opcode.SUB:
                return {
                    opcode,
                    description: `Subtract ${operands[1]} from ${operands[0]}, store result in ${operands[0]}`,
                    assembly: `SUB ${operands[0]}, ${operands[1]}`,
                    destReg: operands[0],
                    srcReg: operands[1],
                };

            case Opcode.AND:
                return {
                    opcode,
                    description: `Bitwise AND of ${operands[0]} and ${operands[1]} — keeps only bits set in both`,
                    assembly: `AND ${operands[0]}, ${operands[1]}`,
                    destReg: operands[0],
                    srcReg: operands[1],
                };

            case Opcode.OR:
                return {
                    opcode,
                    description: `Bitwise OR of ${operands[0]} and ${operands[1]} — keeps bits set in either`,
                    assembly: `OR ${operands[0]}, ${operands[1]}`,
                    destReg: operands[0],
                    srcReg: operands[1],
                };

            case Opcode.XOR:
                return {
                    opcode,
                    description: `Bitwise XOR of ${operands[0]} and ${operands[1]} — keeps bits that differ`,
                    assembly: `XOR ${operands[0]}, ${operands[1]}`,
                    destReg: operands[0],
                    srcReg: operands[1],
                };

            case Opcode.NOT:
                return {
                    opcode,
                    description: `Bitwise NOT of ${operands[0]} — flips every bit`,
                    assembly: `NOT ${operands[0]}`,
                    destReg: operands[0],
                };

            case Opcode.SHL:
                return {
                    opcode,
                    description: `Shift ${operands[0]} left by 1 (multiply by 2)`,
                    assembly: `SHL ${operands[0]}`,
                    destReg: operands[0],
                };

            case Opcode.SHR:
                return {
                    opcode,
                    description: `Shift ${operands[0]} right by 1 (divide by 2)`,
                    assembly: `SHR ${operands[0]}`,
                    destReg: operands[0],
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

    execute(decoded) {
        const result = {
            changedRegisters: [],
            flagsChanged: false,
            details: '',
        };

        switch (decoded.opcode) {
            case Opcode.LOAD_IMM: {
                const { targetReg, value } = decoded;
                this.registers[targetReg] = value & 0xFF;
                result.changedRegisters.push(targetReg);
                result.details = `${targetReg} ← ${value}`;
                // Note: LOAD_IMM does NOT update flags. Only ALU ops do.
                break;
            }

            case Opcode.ADD: {
                const { destReg, srcReg } = decoded;
                const a = this.registers[destReg];
                const b = this.registers[srcReg];
                const raw = a + b;
                const masked = this.updateFlags(raw);
                this.registers[destReg] = masked;
                result.changedRegisters.push(destReg);
                result.flagsChanged = true;
                result.details = `${destReg} ← ${a} + ${b} = ${masked}`;
                break;
            }

            case Opcode.SUB: {
                const { destReg, srcReg } = decoded;
                const a = this.registers[destReg];
                const b = this.registers[srcReg];
                const raw = a - b;
                const masked = this.updateFlags(raw);
                this.registers[destReg] = masked;
                result.changedRegisters.push(destReg);
                result.flagsChanged = true;
                result.details = `${destReg} ← ${a} - ${b} = ${masked}`;
                break;
            }

            case Opcode.AND: {
                const { destReg, srcReg } = decoded;
                const a = this.registers[destReg];
                const b = this.registers[srcReg];
                const raw = a & b;
                const masked = this.updateFlags(raw);
                this.registers[destReg] = masked;
                result.changedRegisters.push(destReg);
                result.flagsChanged = true;
                result.details = `${destReg} ← ${a} AND ${b} = ${masked}`;
                break;
            }

            case Opcode.OR: {
                const { destReg, srcReg } = decoded;
                const a = this.registers[destReg];
                const b = this.registers[srcReg];
                const raw = a | b;
                const masked = this.updateFlags(raw);
                this.registers[destReg] = masked;
                result.changedRegisters.push(destReg);
                result.flagsChanged = true;
                result.details = `${destReg} ← ${a} OR ${b} = ${masked}`;
                break;
            }

            case Opcode.XOR: {
                const { destReg, srcReg } = decoded;
                const a = this.registers[destReg];
                const b = this.registers[srcReg];
                const raw = a ^ b;
                const masked = this.updateFlags(raw);
                this.registers[destReg] = masked;
                result.changedRegisters.push(destReg);
                result.flagsChanged = true;
                result.details = `${destReg} ← ${a} XOR ${b} = ${masked}`;
                break;
            }

            case Opcode.NOT: {
                const { destReg } = decoded;
                const a = this.registers[destReg];
                const raw = ~a;
                const masked = this.updateFlags(raw);
                this.registers[destReg] = masked;
                result.changedRegisters.push(destReg);
                result.flagsChanged = true;
                result.details = `${destReg} ← NOT ${a} = ${masked}`;
                break;
            }

            case Opcode.SHL: {
                const { destReg } = decoded;
                const a = this.registers[destReg];
                const raw = a << 1;
                const masked = this.updateFlags(raw);
                this.registers[destReg] = masked;
                result.changedRegisters.push(destReg);
                result.flagsChanged = true;
                result.details = `${destReg} ← ${a} << 1 = ${masked}`;
                break;
            }

            case Opcode.SHR: {
                const { destReg } = decoded;
                const a = this.registers[destReg];
                // Carry gets the bit that's about to be shifted out
                this.flags.C = (a & 1) !== 0;
                const raw = a >> 1;
                const masked = raw & 0xFF;
                this.flags.Z = masked === 0;
                this.flags.N = (masked & 0x80) !== 0;
                this.registers[destReg] = masked;
                result.changedRegisters.push(destReg);
                result.flagsChanged = true;
                result.details = `${destReg} ← ${a} >> 1 = ${masked}`;
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

    step() {
        if (this.halted) {
            return { status: 'halted', message: 'CPU is halted. Reset to run again.' };
        }

        const pc = this.registers[Register.PC];
        this.cycleCount++;

        const instruction = this.fetch();
        if (!instruction) {
            this.halted = true;
            return {
                status: 'error',
                message: `PC (${pc}) is out of bounds! No instruction at this address. CPU halted.`,
            };
        }

        const decoded = this.decode(instruction);
        const result = this.execute(decoded);

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

window.CPU = CPU;
window.Opcode = Opcode;
window.Register = Register;
window.PROGRAMS = PROGRAMS;
window.makeInstruction = makeInstruction;
