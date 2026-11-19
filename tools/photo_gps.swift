// Liest GPS-Position und Aufnahmedatum aus einem Foto (JPEG, HEIC, PNG).
// Aufruf: swift tools/photo_gps.swift FOTO  ->  {"lat":..,"lng":..,"date":".."} oder {}
import Foundation
import ImageIO

let path = CommandLine.arguments[1]
var out: [String: Any] = [:]
if let src = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
   let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [String: Any] {
    if let gps = props[kCGImagePropertyGPSDictionary as String] as? [String: Any],
       var lat = gps[kCGImagePropertyGPSLatitude as String] as? Double,
       var lng = gps[kCGImagePropertyGPSLongitude as String] as? Double {
        if (gps[kCGImagePropertyGPSLatitudeRef as String] as? String) == "S" { lat = -lat }
        if (gps[kCGImagePropertyGPSLongitudeRef as String] as? String) == "W" { lng = -lng }
        out["lat"] = lat; out["lng"] = lng
    }
    if let exif = props[kCGImagePropertyExifDictionary as String] as? [String: Any],
       let d = exif[kCGImagePropertyExifDateTimeOriginal as String] as? String {
        out["date"] = d
    }
}
let data = try! JSONSerialization.data(withJSONObject: out)
print(String(data: data, encoding: .utf8)!)
