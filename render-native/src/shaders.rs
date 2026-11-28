use serde_json::{json, Value};

include!(concat!(env!("OUT_DIR"), "/shaders.rs"));

pub fn file(name: &str) -> &'static str {
    WGSL_FILES
        .iter()
        .find(|(n, _)| *n == name)
        .map(|(_, t)| *t)
        .unwrap_or_else(|| panic!("{name} is not in src/lib/webgl/shaders"))
}

pub fn assemble(module: &Value) -> String {
    module["segments"]
        .as_array()
        .unwrap()
        .iter()
        .map(|seg| match seg.get("file").and_then(|f| f.as_str()) {
            Some(name) => file(name).to_string(),
            None => seg["text"].as_str().unwrap().to_string(),
        })
        .collect()
}

pub fn naga_check(code: &str) -> Result<(), String> {
    let module = naga::front::wgsl::parse_str(code).map_err(|e| e.emit_to_string(code))?;
    naga::valid::Validator::new(naga::valid::ValidationFlags::all(), naga::valid::Capabilities::all())
        .validate(&module)
        .map_err(|e| e.emit_to_string(code))?;
    Ok(())
}

pub fn ledger(objects: &[Value]) -> Value {
    let modules: Vec<Value> = objects
        .iter()
        .filter(|o| o["kind"] == "module")
        .map(|m| {
            let code = assemble(m);
            let generated: Vec<&str> = m["segments"]
                .as_array()
                .unwrap()
                .iter()
                .filter_map(|s| s.get("text").and_then(|t| t.as_str()))
                .collect();
            let generated_lines: usize = generated.iter().map(|t| t.lines().count()).sum();
            json!({
                "label": m["label"],
                "files": m["files"],
                "identicalToBrowser": code == m["code"].as_str().unwrap(),
                "generatedLines": generated_lines,
                "generatedText": generated,
                "naga": match naga_check(&code) { Ok(()) => json!("ok"), Err(e) => json!(e) },
            })
        })
        .collect();
    json!({ "modules": modules })
}
