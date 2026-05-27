let isScanning = false;

function startQRScanning(cpId) {
  if (isScanning) return;
  isScanning = true;

  const video = document.getElementById('scanner-video');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const scan = () => {
    if (!scannerStream) { isScanning = false; return; }
    
    try {
      // Check if video is ready
      if (video.readyState !== video.HAVE_ENOUGH_DATA) {
        requestAnimationFrame(scan);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      if (canvas.width === 0 || canvas.height === 0) {
        requestAnimationFrame(scan);
        return;
      }

      ctx.drawImage(video, 0, 0);

      // Get image data and scan for QR code
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // Check if jsQR is available
      if (typeof jsQR === 'undefined') {
        console.error('jsQR library not loaded');
        document.getElementById('scan-result').textContent = '❌ QR Scanner library failed to load. Please refresh the page.';
        document.getElementById('scan-result').className = 'result-error';
        isScanning = false;
        return;
      }

      const code = jsQR(imageData.data, canvas.width, canvas.height);
      
      if (code) {
        const participantId = code.data;
        performCheckin(participantId, cpId);
        stopScanner();
        return;
      }
    } catch(e) {
      console.error('QR Scan error:', e);
    }

    requestAnimationFrame(scan);
  };

  scan();
}
