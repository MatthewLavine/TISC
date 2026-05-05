/* ============================================================
   TISC — CPU Engine (Iteration 7)
   
   KEY CONCEPTS (New in Iteration 7):
   
   15. MEMORY-MAPPED I/O (MMIO):
       The CPU communicates with the outside world via memory addresses.
       Writing to address 0xF0 acts as "Display Output" (prints to screen).
       Reading from address 0xF1 gets "Keyboard Input" (reads key presses).
       
   16. INTERRUPTS (IRQs & ISRs):
       Instead of polling (looping forever to check for input), external hardware
       can trigger an Interrupt Request (IRQ). When enabled (I flag = 1), the CPU
       pauses what it's doing, pushes its state (PC and Flags) to the stack, and jumps
       to a fixed Interrupt Service Routine (ISR) address (0x80).
       IRET returns from the interrupt, popping the state back.
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

    // --- Iteration 6: Stack & Subroutines ---
    /** Push register onto the stack */
    PUSH: 'PUSH',
    /** Pop top of stack into register */
    POP: 'POP',
    /** Push return address and jump to subroutine */
    CALL: 'CALL',
    /** Pop return address and jump back */
    RET: 'RET',

    // --- Iteration 7: I/O & Interrupts ---
    /** Set Interrupt flag (Enable interrupts) */
    STI: 'STI',
    /** Clear Interrupt flag (Disable interrupts) */
    CLI: 'CLI',
    /** Return from Interrupt */
    IRET: 'IRET',
});

/** RAM size in bytes. 256 = one byte can address the whole space (0x00–0xFF). */
const RAM_SIZE = 256;

/**
 * CPU phase — the three stages every instruction goes through.
 * In a real CPU, each phase takes one or more clock cycles.
 */
const Phase = Object.freeze({
    FETCH: 'fetch',
    DECODE: 'decode',
    EXECUTE: 'execute',
});

const Register = Object.freeze({
    PC: 'PC',
    SP: 'SP',
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
        I: false,  // Interrupt Enable flag: if true, CPU will handle IRQs
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

    'sum-1-to-n': {
        name: 'Sum 1 to 10',
        description: 'Computes 1+2+3+...+10 = 55. R0 accumulates the sum, R1 is the counter (counts up from 1). The loop adds R1 to R0, increments R1, and checks if R1 has passed 10.',
        instructions: [
            /* 0 */ makeInstruction(Opcode.LOAD_IMM, Register.R0, 0),     // R0 = sum = 0
            /* 1 */ makeInstruction(Opcode.LOAD_IMM, Register.R1, 1),     // R1 = counter = 1
            /* 2 */ makeInstruction(Opcode.LOAD_IMM, Register.R2, 1),     // R2 = step = 1
            /* 3 */ makeInstruction(Opcode.LOAD_IMM, Register.R3, 11),    // R3 = limit = 11 (stop when R1 == 11)
            // --- loop start (addr 4) ---
            /* 4 */ makeInstruction(Opcode.ADD, Register.R0, Register.R1), // sum += counter
            /* 5 */ makeInstruction(Opcode.ADD, Register.R1, Register.R2), // counter += 1
            /* 6 */ makeInstruction(Opcode.CMP, Register.R1, Register.R3), // counter == 11?
            /* 7 */ makeInstruction(Opcode.JNZ, 4),                       // if not, loop
            // --- loop end ---
            /* 8 */ makeInstruction(Opcode.HALT),                         // R0 = 55
        ],
    },

    'multiply': {
        name: 'Multiply (6 × 7)',
        description: 'Multiplies 6 × 7 = 42 using repeated addition — no MUL instruction needed! R0 accumulates the product, R1 counts down from 7 to 0, adding 6 each time. This is exactly how early CPUs did multiplication.',
        instructions: [
            /* 0 */ makeInstruction(Opcode.LOAD_IMM, Register.R0, 0),     // R0 = product = 0
            /* 1 */ makeInstruction(Opcode.LOAD_IMM, Register.R1, 7),     // R1 = counter = 7
            /* 2 */ makeInstruction(Opcode.LOAD_IMM, Register.R2, 6),     // R2 = multiplicand = 6
            /* 3 */ makeInstruction(Opcode.LOAD_IMM, Register.R3, 1),     // R3 = 1 (for decrement)
            // --- loop start (addr 4) ---
            /* 4 */ makeInstruction(Opcode.ADD, Register.R0, Register.R2), // product += 6
            /* 5 */ makeInstruction(Opcode.SUB, Register.R1, Register.R3), // counter -= 1
            /* 6 */ makeInstruction(Opcode.JNZ, 4),                       // if counter != 0, loop
            // --- loop end ---
            /* 7 */ makeInstruction(Opcode.HALT),                         // R0 = 42
        ],
    },

    'fibonacci': {
        name: 'Fibonacci (Loop)',
        description: 'Computes 12 Fibonacci numbers in a loop (~88 cycles). R0/R1 hold prev/curr, swapped via XOR each iteration. Stores the latest value to RAM[0x00] — it keeps overwriting because we can only STORE to fixed addresses. Watch R1 cycle through: 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144!',
        instructions: [
            /* 0  */ makeInstruction(Opcode.LOAD_IMM, Register.R0, 0),     // R0 = prev = 0
            /* 1  */ makeInstruction(Opcode.LOAD_IMM, Register.R1, 1),     // R1 = curr = 1
            /* 2  */ makeInstruction(Opcode.LOAD_IMM, Register.R2, 12),    // R2 = counter (12 iterations)
            /* 3  */ makeInstruction(Opcode.LOAD_IMM, Register.R3, 1),     // R3 = 1 (for decrement)
            // --- loop start (addr 4) ---
            /* 4  */ makeInstruction(Opcode.STORE, Register.R1, 0x00),     // RAM[0] = current fib value
            /* 5  */ makeInstruction(Opcode.ADD, Register.R0, Register.R1), // next = prev + curr
            /* 6  */ makeInstruction(Opcode.XOR, Register.R0, Register.R1), // XOR swap R0 ↔ R1
            /* 7  */ makeInstruction(Opcode.XOR, Register.R1, Register.R0), //   so R0 = old curr (new prev)
            /* 8  */ makeInstruction(Opcode.XOR, Register.R0, Register.R1), //   and R1 = next (new curr)
            /* 9  */ makeInstruction(Opcode.SUB, Register.R2, Register.R3), // counter -= 1
            /* 10 */ makeInstruction(Opcode.JNZ, 4),                       // if counter != 0, loop
            // --- loop end ---
            /* 11 */ makeInstruction(Opcode.HALT),                         // R1 = 144, RAM[0] = 144
        ],
    },

    'subroutine-basic': {
        name: 'Basic Subroutine',
        description: 'Demonstrates CALL and RET. The main program loads a value, CALLs a subroutine to double it, and then halts. Notice how CALL pushes the return address (0x02) to the stack (at RAM 0xFF), and RET pops it back into the PC!',
        instructions: [
            // --- Main Program ---
            /* 0 */ makeInstruction(Opcode.LOAD_IMM, Register.R0, 5),     // R0 = 5
            /* 1 */ makeInstruction(Opcode.CALL, 3),                      // Call "Double" subroutine at address 3
            /* 2 */ makeInstruction(Opcode.HALT),                         // Execution ends here (R0 = 10)

            // --- Subroutine "Double" ---
            /* 3 */ makeInstruction(Opcode.ADD, Register.R0, Register.R0), // R0 = R0 + R0
            /* 4 */ makeInstruction(Opcode.RET),                          // Return to caller
        ],
    },

    'stack-push-pop': {
        name: 'Push & Pop (Save State)',
        description: 'Shows how to use the stack to save a register. We put 42 in R0, PUSH it, clobber R0 with 0, then POP it back into R1. The stack saves the day!',
        instructions: [
            /* 0 */ makeInstruction(Opcode.LOAD_IMM, Register.R0, 42),    // R0 = 42
            /* 1 */ makeInstruction(Opcode.PUSH, Register.R0),            // Save 42 to the stack
            /* 2 */ makeInstruction(Opcode.LOAD_IMM, Register.R0, 0),     // R0 is overwritten! (R0 = 0)
            /* 4 */ makeInstruction(Opcode.HALT),
        ],
    },

    'echo-interrupt': {
        name: 'Interrupt-driven Echo',
        description: 'When you press a key, an interrupt fires. The CPU jumps to the ISR (Interrupt Service Routine) at address 0x10, reads the key from 0xF1, echoes it to 0xF0, and returns. Notice how the main loop just spins doing nothing!',
        instructions: [
            // --- Main Program ---
            /* 0x00 */ makeInstruction(Opcode.STI),                      // Enable interrupts
            /* 0x01 */ makeInstruction(Opcode.JMP, 1),                   // Infinite loop
            /* 0x02 */ null,
            /* 0x03 */ null,
            /* 0x04 */ null,
            /* 0x05 */ null,
            /* 0x06 */ null,
            /* 0x07 */ null,
            /* 0x08 */ null,
            /* 0x09 */ null,
            /* 0x0A */ null,
            /* 0x0B */ null,
            /* 0x0C */ null,
            /* 0x0D */ null,
            /* 0x0E */ null,
            /* 0x0F */ null,

            // --- ISR (Interrupt Service Routine) at 0x10 ---
            // CPU auto-disabled interrupts when it jumped here
            /* 0x10 */ makeInstruction(Opcode.PUSH, Register.R0),        // Save R0 since we're interrupting!
            /* 0x11 */ makeInstruction(Opcode.LOAD, Register.R0, 0xF1),  // Read from Keyboard (0xF1)
            /* 0x12 */ makeInstruction(Opcode.STORE, Register.R0, 0xF0), // Write to Display (0xF0)
            /* 0x13 */ makeInstruction(Opcode.POP, Register.R0),         // Restore R0
            /* 0x14 */ makeInstruction(Opcode.IRET),                     // Return and re-enable interrupts
        ],
    },
};

class CPU {
    constructor() {
        this.registers = {
            [Register.PC]: 0,
            [Register.SP]: 0xFF,  // Stack grows downwards from the end of RAM
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

        /** Current phase in the instruction cycle */
        this.phase = Phase.FETCH;

        /** The fetched instruction (held between phases) */
        this._fetchedInstruction = null;

        /** The decoded instruction (held between phases) */
        this._decodedInstruction = null;

        /** Hardware interrupt request line */
        this.pendingInterrupt = false;
    }

    requestInterrupt() {
        this.pendingInterrupt = true;
    }

    loadProgram(instructions) {
        this.program = [...instructions];
        this.reset();
    }

    reset() {
        for (const reg of Object.keys(this.registers)) {
            this.registers[reg] = reg === Register.SP ? 0xFF : 0;
        }
        this.flags = makeFlags();
        this.ram.fill(0);
        this.ramChanges = [];
        this.halted = false;
        this.cycleCount = 0;
        this.phase = Phase.FETCH;
        this._fetchedInstruction = null;
        this._decodedInstruction = null;
        this.pendingInterrupt = false;
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

            case Opcode.PUSH:
                return {
                    opcode,
                    description: `Push ${operands[0]} onto the stack`,
                    assembly: `PUSH ${operands[0]}`,
                    srcReg: operands[0],
                };

            case Opcode.POP:
                return {
                    opcode,
                    description: `Pop the top of the stack into ${operands[0]}`,
                    assembly: `POP ${operands[0]}`,
                    destReg: operands[0],
                };

            case Opcode.CALL:
                return {
                    opcode,
                    description: `Push return address and jump to subroutine at ${operands[0]}`,
                    assembly: `CALL ${operands[0]}`,
                    target: operands[0],
                };

            case Opcode.RET:
                return {
                    opcode,
                    description: `Pop return address from stack and jump back`,
                    assembly: `RET`,
                };

            case Opcode.STI:
                return {
                    opcode,
                    description: `Set Interrupt flag (Enable hardware interrupts)`,
                    assembly: `STI`,
                };

            case Opcode.CLI:
                return {
                    opcode,
                    description: `Clear Interrupt flag (Disable hardware interrupts)`,
                    assembly: `CLI`,
                };

            case Opcode.IRET:
                return {
                    opcode,
                    description: `Return from Interrupt (Restores flags and PC)`,
                    assembly: `IRET`,
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

            case Opcode.PUSH: {
                const { srcReg } = decoded;
                const val = this.registers[srcReg];
                const sp = this.registers[Register.SP];
                // Write to current SP, then decrement
                this.writeMemory(sp, val);
                const newSp = (sp - 1) & 0xFF;
                this.registers[Register.SP] = newSp;
                result.memoryChanged = true;
                result.changedRegisters.push(Register.SP);
                result.details = `Pushed ${srcReg}(${val}) to RAM[0x${sp.toString(16).toUpperCase().padStart(2,'0')}], SP → 0x${newSp.toString(16).toUpperCase().padStart(2,'0')}`;
                break;
            }

            case Opcode.POP: {
                const { destReg } = decoded;
                // Increment SP, then read
                const sp = (this.registers[Register.SP] + 1) & 0xFF;
                const val = this.readMemory(sp);
                this.registers[destReg] = val;
                this.registers[Register.SP] = sp;
                result.changedRegisters.push(destReg, Register.SP);
                result.details = `Popped ${val} from RAM[0x${sp.toString(16).toUpperCase().padStart(2,'0')}] into ${destReg}, SP → 0x${sp.toString(16).toUpperCase().padStart(2,'0')}`;
                break;
            }

            case Opcode.CALL: {
                const { target } = decoded;
                const retAddr = this._fetchPC + 1; // Return address is the instruction *after* CALL
                const sp = this.registers[Register.SP];
                
                // Push return address
                this.writeMemory(sp, retAddr);
                const newSp = (sp - 1) & 0xFF;
                this.registers[Register.SP] = newSp;
                
                // Jump to target
                this.registers[Register.PC] = target;
                
                result.jumped = true;
                result.memoryChanged = true;
                result.changedRegisters.push(Register.SP, Register.PC);
                result.details = `Saved return address (${retAddr}) to stack, jumped → ${target}`;
                break;
            }

            case Opcode.RET: {
                // Pop return address
                const sp = (this.registers[Register.SP] + 1) & 0xFF;
                const retAddr = this.readMemory(sp);
                this.registers[Register.SP] = sp;
                
                // Jump back
                this.registers[Register.PC] = retAddr;
                
                result.jumped = true;
                result.changedRegisters.push(Register.SP, Register.PC);
                result.details = `Returned → address ${retAddr} (popped from stack)`;
                break;
            }

            case Opcode.STI: {
                this.flags.I = true;
                result.flagsChanged = true;
                result.details = 'Interrupts Enabled (I=1)';
                break;
            }

            case Opcode.CLI: {
                this.flags.I = false;
                result.flagsChanged = true;
                result.details = 'Interrupts Disabled (I=0)';
                break;
            }

            case Opcode.IRET: {
                // Pop Flags
                let sp = (this.registers[Register.SP] + 1) & 0xFF;
                const flagByte = this.readMemory(sp);
                this.flags.Z = (flagByte & 1) !== 0;
                this.flags.N = (flagByte & 2) !== 0;
                this.flags.C = (flagByte & 4) !== 0;
                this.flags.I = true; // IRET implies we are done with the interrupt, re-enable them
                
                // Pop PC
                sp = (sp + 1) & 0xFF;
                const retAddr = this.readMemory(sp);
                this.registers[Register.SP] = sp;
                this.registers[Register.PC] = retAddr;
                
                result.jumped = true;
                result.flagsChanged = true;
                result.changedRegisters.push(Register.SP, Register.PC);
                result.details = `Returned from ISR → address ${retAddr}, Flags restored, Interrupts Enabled`;
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
     * Tick — advance the CPU by ONE phase.
     * 
     * This is how real CPUs work: each clock tick moves the
     * instruction through one stage of the pipeline.
     * 
     * Returns an object describing what happened in this phase.
     */
    tick() {
        if (this.halted) {
            return { status: 'halted', phase: null, message: 'CPU is halted. Reset to run again.' };
        }

        switch (this.phase) {
            case Phase.FETCH: {
                // Before fetching the NEXT instruction, check for interrupts!
                // Real CPUs check the IRQ lines at the start of the instruction cycle.
                if (this.pendingInterrupt && this.flags.I) {
                    this.pendingInterrupt = false;
                    
                    // 1. Disable interrupts so ISR isn't interrupted
                    this.flags.I = false;
                    
                    // 2. Push PC
                    const currentPc = this.registers[Register.PC];
                    let sp = this.registers[Register.SP];
                    this.writeMemory(sp, currentPc);
                    sp = (sp - 1) & 0xFF;
                    
                    // 3. Push Flags
                    const flagByte = (this.flags.Z ? 1 : 0) | (this.flags.N ? 2 : 0) | (this.flags.C ? 4 : 0);
                    this.writeMemory(sp, flagByte);
                    sp = (sp - 1) & 0xFF;
                    
                    this.registers[Register.SP] = sp;
                    
                    // 4. Jump to ISR (Hardcoded to 0x10 for TISC)
                    this.registers[Register.PC] = 0x10;
                    
                    return {
                        status: 'interrupt',
                        phase: Phase.FETCH,
                        message: `Interrupt triggered! Pushed PC(${currentPc}) and Flags(${flagByte}). Jumped to ISR at 0x10.`,
                        pc: 0x10,
                        instruction: { opcode: 'INT_ACK', operands: [] },
                    };
                }

                const pc = this.registers[Register.PC];
                this.cycleCount++;
                const instruction = this.fetch();

                if (!instruction) {
                    this.halted = true;
                    return {
                        status: 'error',
                        phase: Phase.FETCH,
                        message: `PC (${pc}) is out of bounds! No instruction at this address. CPU halted.`,
                    };
                }

                this._fetchedInstruction = instruction;
                this._fetchPC = pc;
                this.phase = Phase.DECODE;

                return {
                    status: 'ok',
                    phase: Phase.FETCH,
                    pc,
                    instruction,
                };
            }

            case Phase.DECODE: {
                const decoded = this.decode(this._fetchedInstruction);
                this._decodedInstruction = decoded;
                this.phase = Phase.EXECUTE;

                return {
                    status: 'ok',
                    phase: Phase.DECODE,
                    decoded,
                };
            }

            case Phase.EXECUTE: {
                const decoded = this._decodedInstruction;
                const pc = this._fetchPC;
                const result = this.execute(decoded);

                // Only increment PC if the instruction didn't jump
                if (!this.halted && !result.jumped) {
                    this.registers[Register.PC] = pc + 1;
                    result.changedRegisters.push(Register.PC);
                }

                // Reset phase for next instruction
                this.phase = Phase.FETCH;
                this._fetchedInstruction = null;
                this._decodedInstruction = null;

                return {
                    status: this.halted ? 'halted' : 'ok',
                    phase: Phase.EXECUTE,
                    cycle: this.cycleCount,
                    pc,
                    instruction: this._fetchedInstruction,
                    decoded,
                    result,
                };
            }
        }
    }

    /**
     * Step — run all 3 phases at once (convenience method).
     * Equivalent to calling tick() three times.
     */
    step() {
        if (this.halted) {
            return { status: 'halted', message: 'CPU is halted. Reset to run again.' };
        }

        const fetchResult = this.tick();
        if (fetchResult.status !== 'ok') return fetchResult;

        const decodeResult = this.tick();
        if (decodeResult.status !== 'ok') return decodeResult;

        const executeResult = this.tick();

        // Combine into legacy step() format
        return {
            status: executeResult.status,
            cycle: executeResult.cycle,
            pc: fetchResult.pc,
            instruction: fetchResult.instruction,
            decoded: decodeResult.decoded,
            result: executeResult.result,
        };
    }
}

window.CPU = CPU;
window.Opcode = Opcode;
window.Register = Register;
window.Phase = Phase;
window.PROGRAMS = PROGRAMS;
window.RAM_SIZE = RAM_SIZE;
window.makeInstruction = makeInstruction;
