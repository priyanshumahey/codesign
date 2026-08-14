//! Prints the op tool schemas as JSON.
//!
//! Handy for eyeballing what the model and MCP clients will see:
//! `cargo run -p codesign-core --example tool-schemas`
//! `cargo run -p codesign-core --example tool-schemas -- gemini`

fn main() {
    let gemini = std::env::args().nth(1).as_deref() == Some("gemini");
    let json = if gemini {
        serde_json::to_string_pretty(&codesign_core::schema::gemini_function_declarations())
    } else {
        serde_json::to_string_pretty(&codesign_core::tool_schemas())
    };
    println!("{}", json.expect("schemas serialize"));
}
