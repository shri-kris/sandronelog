// sample_testbench.sv
// A self-contained 4-bit binary counter design and testbench.
// Use this code to test the iverilog compiler and the VCD waveform viewer.

// ----------------------------------------------------
// 1. The Design: 4-bit Binary Counter
// ----------------------------------------------------
module counter_design (
    input  logic clk,
    input  logic rst_n,
    output logic [3:0] count
);
    // Procedural block triggered on the rising edge of clock
    // or falling edge of active-low reset (rst_n)
    always_ff @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            count <= 4'b0000;  // Reset count to 0
        end else begin
            count <= count + 1; // Increment count
        end
    end
endmodule

// ----------------------------------------------------
// 2. The Testbench: Stimulus and Waveform Generation
// ----------------------------------------------------
module top;
    // Testbench signals
    logic clk;
    logic rst_n;
    logic [3:0] count;

    // Instantiate the counter design module
    counter_design u_counter (
        .clk(clk),
        .rst_n(rst_n),
        .count(count)
    );

    // Clock Generator: toggle clk every 5 time units (10ns period)
    initial begin
        clk = 0;
        forever #5 clk = ~clk;
    end

    // Simulation Stimulus
    initial begin
        // Setup waveform dumping to file "waves.vcd"
        // This is what the waveform viewer parses to show signals.
        $dumpfile("waves.vcd");
        $dumpvars(0, top);

        // Initial inputs
        $display("Starting simulation...");
        rst_n = 0;          // Assert active-low reset (keep counter at 0)
        #12;                // Wait 12 time units (mid-clock cycle)
        
        rst_n = 1;          // Deassert reset (counter starts counting)
        #80;                // Let it run for 80 time units
        
        rst_n = 0;          // Reset again briefly
        #10;
        
        rst_n = 1;          // Release reset
        #40;

        $display("Simulation complete! Final count: %d", count);
        $finish;            // Finish the simulation (critical to prevent infinite loops)
    end

endmodule
