/**
 * 오디오 캡처 및 PCM 변환 유틸리티
 */

export interface AudioCaptureOptions {
  sampleRate?: number;
  bufferSize?: number;
  onAudioData?: (pcmData: ArrayBuffer) => void;
}

// HTMLMediaElement는 한 번만 MediaElementSourceNode에 연결될 수 있음
// 캐시를 통해 재사용
const mediaSourceCache = new WeakMap<HTMLMediaElement, {
  audioContext: AudioContext;
  sourceNode: MediaElementAudioSourceNode;
}>();

export class AudioCapture {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private options: Required<AudioCaptureOptions>;
  private isCapturing = false;
  private usingCachedSource = false;

  constructor(options: AudioCaptureOptions = {}) {
    this.options = {
      sampleRate: options.sampleRate ?? 16000,
      bufferSize: options.bufferSize ?? 8192, // 8192로 증가 (CPU 부하 감소)
      onAudioData: options.onAudioData ?? (() => {}),
    };
  }

  /**
   * Video 요소에서 오디오 캡처 시작
   */
  async startFromVideo(videoElement: HTMLVideoElement): Promise<void> {
    if (this.isCapturing) {
      throw new Error('Already capturing audio');
    }

    try {
      // 캐시된 소스 노드가 있는지 확인
      const cached = mediaSourceCache.get(videoElement);

      if (cached && cached.audioContext.state !== 'closed') {
        // 기존 AudioContext와 SourceNode 재사용 (닫히지 않은 경우만)
        this.audioContext = cached.audioContext;
        this.sourceNode = cached.sourceNode;
        this.usingCachedSource = true;

        // AudioContext가 suspended 상태면 resume
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
        }
      } else {
        // 닫힌 캐시가 있으면 삭제
        if (cached) {
          mediaSourceCache.delete(videoElement);
        }
        // 새로 생성
        this.audioContext = new AudioContext({ sampleRate: this.options.sampleRate });

        try {
          this.sourceNode = this.audioContext.createMediaElementSource(videoElement);
        } catch (corsError) {
          // CORS 오류로 MediaElementSource 생성 실패 시
          console.error('[AudioCapture] CORS error creating MediaElementSource:', corsError);
          // AudioContext 정리
          await this.audioContext.close();
          this.audioContext = null;
          throw new Error('CORS 정책으로 인해 오디오 캡처 불가. 비디오는 계속 재생됩니다.');
        }

        // 캐시에 저장
        mediaSourceCache.set(videoElement, {
          audioContext: this.audioContext,
          sourceNode: this.sourceNode,
        });

        // 캐시에 저장했으므로 캐시 모드로 설정 (stop()에서 AudioContext를 닫지 않도록)
        // createMediaElementSource는 video당 1번만 호출 가능하므로 반드시 보존해야 함
        this.usingCachedSource = true;

        // 오디오가 들리도록 destination에 연결 (최초 1회만)
        this.sourceNode.connect(this.audioContext.destination);
      }

      this.processorNode = this.audioContext.createScriptProcessor(this.options.bufferSize, 1, 1);

      this.processorNode.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        const pcmData = this.floatTo16BitPCM(inputData);
        this.options.onAudioData(pcmData.buffer as ArrayBuffer);
      };

      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

      this.isCapturing = true;
    } catch (error) {
      // 에러 발생 시 정리
      console.error('[AudioCapture] Failed to start capture:', error);
      this.stop();
      throw error;
    }
  }

  /**
   * 마이크에서 오디오 캡처 시작
   */
  async startFromMicrophone(): Promise<void> {
    if (this.isCapturing) {
      throw new Error('Already capturing audio');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: this.options.sampleRate,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    this.audioContext = new AudioContext({ sampleRate: this.options.sampleRate });
    this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream);
    this.processorNode = this.audioContext.createScriptProcessor(this.options.bufferSize, 1, 1);

    this.processorNode.onaudioprocess = (event) => {
      const inputData = event.inputBuffer.getChannelData(0);
      const pcmData = this.floatTo16BitPCM(inputData);
      this.options.onAudioData(pcmData.buffer as ArrayBuffer);
    };

    this.mediaStreamSource.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);

    this.isCapturing = true;
  }

  /**
   * 캡처 중지
   */
  stop(): void {
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode = null;
    }

    // 캐시된 소스 노드는 유지 (다음 캡처에서 재사용)
    // 캐시되지 않은 경우만 정리
    if (!this.usingCachedSource) {
      if (this.sourceNode) {
        this.sourceNode.disconnect();
        this.sourceNode = null;
      }

      if (this.audioContext) {
        this.audioContext.close();
        this.audioContext = null;
      }
    } else {
      // 캐시된 경우 참조만 정리 (실제 객체는 캐시에 유지)
      this.sourceNode = null;
      this.audioContext = null;
    }

    if (this.mediaStreamSource) {
      this.mediaStreamSource.disconnect();
      this.mediaStreamSource = null;
    }

    this.isCapturing = false;
    this.usingCachedSource = false;
  }

  /**
   * Float32 오디오 데이터를 16-bit PCM으로 변환
   */
  private floatTo16BitPCM(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp to [-1, 1] and convert to 16-bit
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16Array;
  }

  get capturing(): boolean {
    return this.isCapturing;
  }
}

/**
 * 간편한 마이크 캡처 함수
 */
export async function captureMicrophone(
  onAudioData: (pcmData: ArrayBuffer) => void,
  options?: Omit<AudioCaptureOptions, 'onAudioData'>
): Promise<AudioCapture> {
  const capture = new AudioCapture({ ...options, onAudioData });
  await capture.startFromMicrophone();
  return capture;
}

/**
 * 간편한 비디오 오디오 캡처 함수
 */
export async function captureVideoAudio(
  videoElement: HTMLVideoElement,
  onAudioData: (pcmData: ArrayBuffer) => void,
  options?: Omit<AudioCaptureOptions, 'onAudioData'>
): Promise<AudioCapture> {
  const capture = new AudioCapture({ ...options, onAudioData });
  await capture.startFromVideo(videoElement);
  return capture;
}
