import { useEffect, useRef } from "react";

// Exemplo com biblioteca ZXing
export default function Scanner({ onScan }) {
  const videoRef = useRef(null);

  useEffect(() => {
    let codeReader;
    async function initScanner() {
      const { BrowserMultiFormatReader } = await import("@zxing/library");
      codeReader = new BrowserMultiFormatReader();
      const video = videoRef.current;

      try {
        const result = await codeReader.decodeFromVideoDevice(
          null,
          video,
          (result, err) => {
            if (result) onScan(result.getText());
          }
        );
      } catch (err) {
        console.error(err);
      }
    }

    initScanner();

    return () => codeReader?.reset();
  }, [onScan]);

  return <video ref={videoRef} style={{ width: "100%" }} />;
}
