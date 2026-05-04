/* ============================================================
   TISC — CPU Engine (Iteration 4)
   
   KEY CONCEPTS (New in Iteration 4):
   
   8. BRANCHING (Jumps):
      Until now, the PC always increments by 1 after each step.
      Branching instructions CHANGE the PC to a different address,
      letting the CPU skip ahead or loop back.
      
   9. CONDITIONAL JUMPS:
      The real power comes from CONDITIONAL jumps — they check
      the flags register and only jump if a condition is true:
      
      - JZ addr:  Jump if Zero flag is set   (result was 0)
      - JNZ addr: Jump if Zero flag is clear  (result was not 0)
      - JN addr:  Jump if Negative flag is set
      
      Combined with CMP (compare), this gives us if/else and loops.
      
   10. CMP (Compare):
       CMP subtracts two registers just like SUB, but THROWS AWAY
       the result — it only keeps the flags. This lets you ask
       "are these equal?" or "which is bigger?" without destroying
       any data.
   ============================================================ */

const Opcode = Object.freeze({
    // --- Iteration 1 ---
    LOAD_IMM: 'LOAD_IMM',
    ADD: 'ADD',
    HALT: 'HALT',

    // --- Iteration 2: ALU operations ---
    SUB: 'SUB',
    AND: 'AND',
    OR: 'OR',
    XOR: 'XOR',
    NOT: 'NOT',
    SHL: 'SHL',
    SHR: 'SHR',

    // --- Iteration 3: Memory access ---
    STORE: 'STORE',
    LOAD: 'LOAD',

    // --- Iteration 4: Branching ---
    /** Unconditional jump: PC = addr */
    JMP: 'JMP',
    /** Jump if Zero flag set: if (Z) PC = addr */
    JZ: 'JZ',
    /** Jump if Zero flag clear: if (!Z) PC = addr */
    JNZ: 'JNZ',
    /** Jump if Negative flag set: if (N) PC = addr */
    JN: 'JN',
    /** Compare: sets flags from (reg1 - reg2) without storing result */
    CMP: 'CMP',
});

/** RAM size in bytes. 256 = one byte can address the whole space (0x00–0xFF). */
const RAM_SIZE = 256;

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

    // --- Iteration 3: Memory programs ---
    'store-and-load': {
        name: 'Store & Load',
        description: 'Stores values to RAM addresses, then loads them back into different registers. Watch the RAM panel light up as values move between CPU and memory!',
        instructions: [
            makeInstruction(Opcode.LOAD_IMM, Register.R0, 42),       // R0 = 42
            makeInstruction(Opcode.STORE, Register.R0, 0x00),        // RAM[0x00] = 42
            makeInstruction(Opcode.LOAD_IMM, Register.R0, 99),       // R0 = 99
            makeInstruction(Opcode.STORE, Register.R0, 0x01),        // RAM[0x01] = 99
            makeInstruction(Opcode.LOAD_IMM, Register.R0, 0),        // R0 = 0 (clear it)
            makeInstruction(Opcode.LOAD, Register.R1, 0x00),         // R1 = RAM[0x00] = 42
            makeInstruction(Opcode.LOAD, Register.R2, 0x01),         // R2 = RAM[0x01] = 99
            makeInstruction(Opcode.ADD, Register.R1, Register.R2),   // R1 = 42 + 99 = 141
            makeInstruction(Opcode.HALT),
        ],
    },

    'memory-array': {
        name: 'Memory Array',
        description: 'Stores a sequence of values to consecutive RAM addresses (like an array). Then loads two of them back and adds them. Shows how programs organize data in memory.',
        instructions: [
            makeInstruction(Opcode.LOAD_IMM, Register.R0, 10),
            makeInstruction(Opcode.STORE, Register.R0, 0x00),        // array[0] = 10
            makeInstruction(Opcode.LOAD_IMM, Register.R0, 20),
            makeInstruction(Opcode.STORE, Register.R0, 0x01),        // array[1] = 20
            makeInstruction(Opcode.LOAD_IMM, Register.R0, 30),
            makeInstruction(Opcode.STORE, Register.R0, 0x02),        // array[2] = 30
            makeInstruction(Opcode.LOAD_IMM, Register.R0, 40),
            makeInstruction(Opcode.STORE, Register.R0, 0x03),        // array[3] = 40
            makeInstruction(Opcode.LOAD, Register.R0, 0x00),         // R0 = array[0] = 10
            makeInstruction(Opcode.LOAD, Register.R1, 0x03),         // R1 = array[3] = 40
            makeInstruction(Opcode.ADD, Register.R0, Register.R1),   // R0 = 10 + 40 = 50
            makeInstruction(Opcode.STORE, Register.R0, 0x04),        // array[4] = 50 (sum)
            makeInstruction(Opcode.HALT),
        ],
    },

    'register-spill': {
        name: 'Register Spill',
        description: 'When you run out of registers, you "spill" values to RAM temporarily. Computes (1+2) + (3+4) + (5+6) using only 2 registers by saving intermediate results to memory.',
        instructions: [
            makeInstruction(Opcode.LOAD_IMM, Register.R0, 1),
            makeInstruction(Opcode.LOAD_IMM, Register.R1, 2),
            makeInstruction(Opcode.ADD, Register.R0, Register.R1),   // R0 = 3
            makeInstruction(Opcode.STORE, Register.R0, 0x00),        // spill: RAM[0x00] = 3
            makeInstruction(Opcode.LOAD_IMM, Register.R0, 3),
            makeInstruction(Opcode.LOAD_IMM, Register.R1, 4),
            makeInstruction(Opcode.ADD, Register.R0, Register.R1),   // R0 = 7
            makeInstruction(Opcode.STORE, Register.R0, 0x01),        // spill: RAM[0x01] = 7
            makeInstruction(Opcode.LOAD_IMM, Register.R0, 5),
            makeInstruction(Opcode.LOAD_IMM, Register.R1, 6),
            makeInstruction(Opcode.ADD, Register.R0, Register.R1),   // R0 = 11
            makeInstruction(Opcode.LOAD, Register.R1, 0x00),         // reload: R1 = 3
            makeInstruction(Opcode.ADD, Register.R0, Register.R1),   // R0 = 14
            makeInstruction(Opcode.LOAD, Register.R1, 0x01),         // reload: R1 = 7
            makeInstruction(Opcode.ADD, Register.R0, Register.R1),   // R0 = 21
            makeInstruction(Opcode.HALT),
        ],
    },

    // --- Iteration 4: Branching programs ---
    'countdown': {
        name: 'Countdown (Loop)',
        description: 'Counts down from 5 to 0 using a loop. R0 starts at 5, subtracts 1 each iteration, and jumps back until R0 hits 0. This is the CPU\'s first loop!',
        instructions: [
            /* 0 */ makeInstruction(Opcode.LOAD_IMM, Register.R0, 5),    // R0 = 5
            /* 1 */ makeInstruction(Opcode.LOAD_IMM, Register.R1, 1),    // R1 = 1 (decrement amount)
            // --- loop start (addr 2) ---
            /* 2 */ makeInstruction(Opcode.SUB, Register.R0, Register.R1), // R0 = R0 - 1
            /* 3 */ makeInstruction(Opcode.JNZ, 2),                       // if R0 != 0, jump back to addr 2
            // --- loop end ---
            /* 4 */ makeInstruction(Opcode.HALT),
        ],
    },

    'count-to-n': {
        name: 'Count Up to N',
        description: 'Counts from 0 up to 5 using CMP and JNZ. R0 is the counter, R1 is the target. Each iteration increments R0 and compares it to R1 — when they\'re equal, CMP sets the Zero flag and the loop exits.',
        instructions: [
            /* 0 */ makeInstruction(Opcode.LOAD_IMM, Register.R0, 0),    // R0 = counter = 0
            /* 1 */ makeInstruction(Opcode.LOAD_IMM, Register.R1, 5),    // R1 = target = 5
            /* 2 */ makeInstruction(Opcode.LOAD_IMM, Register.R2, 1),    // R2 = step = 1
            // --- loop start (addr 3) ---
            /* 3 */ makeInstruction(Opcode.ADD, Register.R0, Register.R2), // R0 += 1
            /* 4 */ makeInstruction(Opcode.CMP, Register.R0, Register.R1), // compare R0 to R1
            /* 5 */ makeInstruction(Opcode.JNZ, 3),                       // if not equal, loop
            // --- loop end ---
            /* 6 */ makeInstruction(Opcode.HALT),
        ],
    },

    'find-max': {
        name: 'Find Maximum',
        description: 'Finds the largest of 3 values (stored in RAM) using conditional jumps. Loads each value and compares it to the current max — classic if/else logic in assembly!',
        instructions: [
            // Store 3 values in RAM
            /* 0 */ makeInstruction(Opcode.LOAD_IMM, Register.R0, 17),
            /* 1 */ makeInstruction(Opcode.STORE, Register.R0, 0x00),     // array[0] = 17
            /* 2 */ makeInstruction(Opcode.LOAD_IMM, Register.R0, 42),
            /* 3 */ makeInstruction(Opcode.STORE, Register.R0, 0x01),     // array[1] = 42
            /* 4 */ makeInstruction(Opcode.LOAD_IMM, Register.R0, 31),
            /* 5 */ makeInstruction(Opcode.STORE, Register.R0, 0x02),     // array[2] = 31
            // R0 = max = array[0]
            /* 6 */ makeInstruction(Opcode.LOAD, Register.R0, 0x00),      // max = 17
            // Compare with array[1]
            /* 7 */ makeInstruction(Opcode.LOAD, Register.R1, 0x01),      // R1 = 42
            /* 8 */ makeInstruction(Opcode.CMP, Register.R1, Register.R0), // 42 - 17 = 25 (positive, no N flag)
            /* 9 */ makeInstruction(Opcode.JN, 11),                       // if R1 < R0, skip update
            /* 10 */ makeInstruction(Opcode.LOAD, Register.R0, 0x01),     // max = 42
            // Compare with array[2]
            /* 11 */ makeInstruction(Opcode.LOAD, Register.R1, 0x02),     // R1 = 31
            /* 12 */ makeInstruction(Opcode.CMP, Register.R1, Register.R0), // 31 - 42 = negative (N flag set)
            /* 13 */ makeInstruction(Opcode.JN, 15),                      // if R1 < R0, skip update
            /* 14 */ makeInstruction(Opcode.LOAD, Register.R0, 0x02),     // max = array[2]
            // R0 now holds the maximum value
            /* 15 */ makeInstruction(Opcode.HALT),
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

        this.flags = makeFlags();

        /**
         * RAM — NEW in Iteration 3.
         * 
         * 256 bytes of Random Access Memory. Each byte is
         * addressable by a number from 0x00 to 0xFF.
         * 
         * In a real computer, RAM is a separate chip connected
         * to the CPU via a "bus" (a bundle of wires). Accessing
         * RAM is much slower than accessing registers — often
         * 100x slower on modern CPUs. That speed difference is
         * why we have registers at all.
         */
        this.ram = new Uint8Array(RAM_SIZE);

        /** Track which RAM addresses changed this cycle (for UI) */
        this.ramChanges = [];

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
        this.ram.fill(0);
        this.ramChanges = [];
        this.halted = false;
        this.cycleCount = 0;
    }

    /**
     * Read a byte from RAM.
     * 
     * In a real CPU, this triggers a "memory read" on the bus:
     * 1. CPU puts the address on the address bus
     * 2. CPU signals "read" on the control bus
     * 3. RAM chip responds with the data on the data bus
     * This takes multiple clock cycles on real hardware.
     */
    readMemory(address) {
        return this.ram[address & 0xFF];
    }

    /**
     * Write a byte to RAM.
     * Same bus protocol as read, but CPU drives the data bus.
     */
    writeMemory(address, value) {
        const addr = address & 0xFF;
        this.ram[addr] = value & 0xFF;
        this.ramChanges.push(addr);
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

            case Opcode.STORE:
                return {
                    opcode,
                    description: `Store ${operands[0]} to RAM address 0x${operands[1].toString(16).toUpperCase().padStart(2,'0')}`,
                    assembly: `STORE ${operands[0]}, 0x${operands[1].toString(16).toUpperCase().padStart(2,'0')}`,
                    srcReg: operands[0],
                    address: operands[1],
                };

            case Opcode.LOAD:
                return {
                    opcode,
                    description: `Load from RAM address 0x${operands[1].toString(16).toUpperCase().padStart(2,'0')} into ${operands[0]}`,
                    assembly: `LOAD ${operands[0]}, 0x${operands[1].toString(16).toUpperCase().padStart(2,'0')}`,
                    destReg: operands[0],
                    address: operands[1],
                };

            case Opcode.JMP:
                return {
                    opcode,
                    description: `Jump to address ${operands[0]} (unconditional)`,
                    assembly: `JMP ${operands[0]}`,
                    target: operands[0],
                };

            case Opcode.JZ:
                return {
                    opcode,
                    description: `Jump to address ${operands[0]} if Zero flag is set`,
                    assembly: `JZ ${operands[0]}`,
                    target: operands[0],
                };

            case Opcode.JNZ:
                return {
                    opcode,
                    description: `Jump to address ${operands[0]} if Zero flag is NOT set`,
                    assembly: `JNZ ${operands[0]}`,
                    target: operands[0],
                };

            case Opcode.JN:
                return {
                    opcode,
                    description: `Jump to address ${operands[0]} if Negative flag is set`,
                    assembly: `JN ${operands[0]}`,
                    target: operands[0],
                };

            case Opcode.CMP:
                return {
                    opcode,
                    description: `Compare ${operands[0]} and ${operands[1]} (subtract, set flags, discard result)`,
                    assembly: `CMP ${operands[0]}, ${operands[1]}`,
                    reg1: operands[0],
                    reg2: operands[1],
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
        this.ramChanges = [];
        const result = {
            changedRegisters: [],
            flagsChanged: false,
            memoryChanged: false,
            jumped: false,
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

            case Opcode.STORE: {
                const { srcReg, address } = decoded;
                const value = this.registers[srcReg];
                this.writeMemory(address, value);
                result.memoryChanged = true;
                result.details = `RAM[0x${(address & 0xFF).toString(16).toUpperCase().padStart(2,'0')}] ← ${srcReg} (${value})`;
                break;
            }

            case Opcode.LOAD: {
                const { destReg, address } = decoded;
                const value = this.readMemory(address);
                this.registers[destReg] = value;
                result.changedRegisters.push(destReg);
                result.details = `${destReg} ← RAM[0x${(address & 0xFF).toString(16).toUpperCase().padStart(2,'0')}] (${value})`;
                break;
            }

            case Opcode.JMP: {
                const { target } = decoded;
                this.registers[Register.PC] = target;
                result.jumped = true;
                result.changedRegisters.push(Register.PC);
                result.details = `Jump → address ${target}`;
                break;
            }

            case Opcode.JZ: {
                const { target } = decoded;
                if (this.flags.Z) {
                    this.registers[Register.PC] = target;
                    result.jumped = true;
                    result.changedRegisters.push(Register.PC);
                    result.details = `Z=1, jump → address ${target}`;
                } else {
                    result.details = `Z=0, no jump (continue to next)`;
                }
                break;
            }

            case Opcode.JNZ: {
                const { target } = decoded;
                if (!this.flags.Z) {
                    this.registers[Register.PC] = target;
                    result.jumped = true;
                    result.changedRegisters.push(Register.PC);
                    result.details = `Z=0, jump → address ${target}`;
                } else {
                    result.details = `Z=1, no jump (continue to next)`;
                }
                break;
            }

            case Opcode.JN: {
                const { target } = decoded;
                if (this.flags.N) {
                    this.registers[Register.PC] = target;
                    result.jumped = true;
                    result.changedRegisters.push(Register.PC);
                    result.details = `N=1, jump → address ${target}`;
                } else {
                    result.details = `N=0, no jump (continue to next)`;
                }
                break;
            }

            case Opcode.CMP: {
                const { reg1, reg2 } = decoded;
                const a = this.registers[reg1];
                const b = this.registers[reg2];
                const raw = a - b;
                this.updateFlags(raw);
                // CMP does NOT store the result — only flags change
                result.flagsChanged = true;
                result.details = `${reg1}(${a}) - ${reg2}(${b}) = ${raw & 0xFF} (flags only)`;
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

        // Only increment PC if the instruction didn't jump
        if (!this.halted && !result.jumped) {
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
window.RAM_SIZE = RAM_SIZE;
window.makeInstruction = makeInstruction;
