use std::fs;
use std::path::Path;

fn main() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("../src/lib/webgl/shaders");
    println!("cargo:rerun-if-changed={}", dir.display());
    let mut names: Vec<String> = fs::read_dir(&dir)
        .unwrap()
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| n.ends_with(".wgsl"))
        .collect();
    names.sort();
    let rows: String = names
        .iter()
        .map(|n| {
            format!(
                "    (\"{n}\", include_str!(concat!(env!(\"CARGO_MANIFEST_DIR\"), \"/../src/lib/webgl/shaders/{n}\"))),\n"
            )
        })
        .collect();
    let out = Path::new(&std::env::var("OUT_DIR").unwrap()).join("shaders.rs");
    fs::write(out, format!("pub static WGSL_FILES: &[(&str, &str)] = &[\n{rows}];\n")).unwrap();
}
