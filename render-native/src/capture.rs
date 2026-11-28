use serde_json::Value;
use std::fs;

pub struct Capture {
    pub manifest: Value,
    pub data: Vec<u8>,
    pub blob_base: usize,
}

impl Capture {
    pub fn load(path: &str) -> Capture {
        let data = fs::read(path).unwrap_or_else(|e| panic!("{path}: {e}"));
        assert_eq!(&data[0..4], b"F4XC", "{path} is not a capture");
        let len = u32::from_le_bytes(data[8..12].try_into().unwrap()) as usize;
        let manifest: Value = serde_json::from_slice(&data[16..16 + len]).unwrap();
        let blob_base = (16 + len).div_ceil(8) * 8;
        Capture { manifest, data, blob_base }
    }

    pub fn blob(&self, v: &Value) -> &[u8] {
        let b = &v["blob"];
        let start = self.blob_base + b[0].as_u64().unwrap() as usize;
        &self.data[start..start + b[1].as_u64().unwrap() as usize]
    }

    pub fn objects(&self) -> &Vec<Value> {
        self.manifest["objects"].as_array().unwrap()
    }

    pub fn ops(&self) -> &Vec<Value> {
        self.manifest["ops"].as_array().unwrap()
    }

    pub fn canvas_size(&self) -> (u32, u32) {
        let s = &self.manifest["canvas"]["size"];
        (s[0].as_u64().unwrap() as u32, s[1].as_u64().unwrap() as u32)
    }

    pub fn canvas_format(&self) -> String {
        self.manifest["canvas"]["format"].as_str().unwrap().to_string()
    }
}

pub fn s<'a>(v: &'a Value, key: &str, default: &'a str) -> &'a str {
    v.get(key).and_then(|x| x.as_str()).unwrap_or(default)
}

pub fn n(v: &Value, key: &str, default: u64) -> u64 {
    v.get(key).and_then(|x| x.as_u64()).unwrap_or(default)
}

pub fn f(v: &Value, key: &str, default: f64) -> f64 {
    v.get(key).and_then(|x| x.as_f64()).unwrap_or(default)
}

pub fn b(v: &Value, key: &str) -> bool {
    v.get(key).and_then(|x| x.as_bool()).unwrap_or(false)
}

pub fn id(v: &Value, key: &str) -> Option<u64> {
    v.get(key).and_then(|x| x.as_u64())
}
