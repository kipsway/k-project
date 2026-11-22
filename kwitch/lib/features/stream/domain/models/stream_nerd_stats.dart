class StreamNerdStats {
  final String resolution;
  final int fps;
  final String videoCodec;
  final String audioCodec;
  final int currentBitrateKbps;
  final double bufferHealthSeconds;
  final double latencyToLiveSeconds;
  final int droppedFrames;
  final int totalFrames;
  final String activeNodeName;
  final int nodePingMs;
  final String localLoopbackPort;

  const StreamNerdStats({
    this.resolution = '2560x1440',
    this.fps = 60,
    this.videoCodec = 'H.264 (High 5.1) / AVC',
    this.audioCodec = 'mp4a.40.2 (AAC 160 kbps, 48 kHz)',
    this.currentBitrateKbps = 14280,
    this.bufferHealthSeconds = 3.2,
    this.latencyToLiveSeconds = 1.1,
    this.droppedFrames = 0,
    this.totalFrames = 194200,
    this.activeNodeName = 'Frankfurt Ultra-Edge (DE)',
    this.nodePingMs = 28,
    this.localLoopbackPort = '127.0.0.1:8989',
  });

  double get dropRatePercentage =>
      totalFrames > 0 ? (droppedFrames / totalFrames) * 100 : 0.0;
}
