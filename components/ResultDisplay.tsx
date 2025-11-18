import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { ImageInfo } from '../types';
import { PromptType } from '../types';
import { ClipboardIcon } from './icons/ClipboardIcon';
import { TranslateIcon } from './icons/TranslateIcon';
import Spinner from './Spinner';
import { translateToEnglish, generateSpeech, recommendVoicesFromPrompt } from '../services/geminiService';
import type { PrebuiltVoice } from '../services/geminiService';
import { DownloadIcon } from './icons/DownloadIcon';
import { SpeakerIcon } from './icons/SpeakerIcon';
import { StopIcon } from './icons/StopIcon';

interface ResultDisplayProps {
  imageInfo: ImageInfo;
  audioPrompt: string;
  onReset: () => void;
  promptType: PromptType;
  onSwitchPrompt: (newType: PromptType) => void;
  isSwitching: boolean;
}

// Helper functions for audio processing
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

function createWavBlob(pcmData: Uint8Array, numChannels: number, sampleRate: number, bitsPerSample: number): Blob {
    const dataSize = pcmData.length;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF header
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, 36 + dataSize, true);
    view.setUint32(8, 0x57415645, false); // "WAVE"

    // fmt chunk
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true); // audio format (1 = PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    const blockAlign = numChannels * (bitsPerSample / 8);
    view.setUint32(28, sampleRate * blockAlign, true); // byte rate
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data chunk
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, dataSize, true);

    new Uint8Array(buffer).set(pcmData, 44);

    return new Blob([buffer], { type: 'audio/wav' });
}

const voiceGroups: {
    label: string;
    voices: { name: PrebuiltVoice; label: string }[];
}[] = [
    {
        label: "여성 목소리",
        voices: [
            { name: 'Kore', label: 'Kore (차분하고 선명함)' },
        ]
    },
    {
        label: "남성 목소리",
        voices: [
            { name: 'Puck', label: 'Puck (중립적이고 안정적)' },
            { name: 'Zephyr', label: 'Zephyr (따뜻하고 부드러움)' },
            { name: 'Charon', label: 'Charon (깊고 낮음)' },
            { name: 'Fenrir', label: 'Fenrir (강하고 활기참)' },
        ]
    }
];

const allVoices = voiceGroups.flatMap(g => g.voices);
const voiceLabelMap = Object.fromEntries(allVoices.map(v => [v.name, v.label]));


const ResultDisplay: React.FC<ResultDisplayProps> = ({ 
  imageInfo, 
  audioPrompt, 
  onReset,
  promptType,
  onSwitchPrompt,
  isSwitching
}) => {
  const [copied, setCopied] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [englishPrompt, setEnglishPrompt] = useState<string | null>(null);
  const [displayLanguage, setDisplayLanguage] = useState<'ko' | 'en'>('ko');
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [generatedAudioData, setGeneratedAudioData] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [voiceSelection, setVoiceSelection] = useState<PrebuiltVoice>('Kore');
  const [recommendedVoices, setRecommendedVoices] = useState<PrebuiltVoice[]>([]);
  const [isRecommendingVoice, setIsRecommendingVoice] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    // Reset states when prompt changes
    setEnglishPrompt(null);
    setDisplayLanguage('ko');
    setIsTranslating(false);
    setGeneratedAudioData(null);
    setRecommendedVoices([]);
    if (activeAudioSourceRef.current) {
      activeAudioSourceRef.current.stop();
    }

    // Automatically recommend voices when a new voice prompt is generated
    if (promptType === PromptType.VOICE && audioPrompt) {
      const getRecommendation = async () => {
        setIsRecommendingVoice(true);
        try {
          const recommended = await recommendVoicesFromPrompt(audioPrompt);
          setRecommendedVoices(recommended);
          if (recommended.length > 0) {
            setVoiceSelection(recommended[0]);
          }
        } catch (err) {
          console.error("Voice recommendation failed:", err);
          setVoiceSelection('Puck'); // Fallback to a default
        } finally {
          setIsRecommendingVoice(false);
        }
      };
      getRecommendation();
    }
  }, [audioPrompt, promptType]);

  useEffect(() => {
    // Reset audio when voice selection changes
    setGeneratedAudioData(null);
  }, [voiceSelection]);

  useEffect(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    
    return () => {
        if (activeAudioSourceRef.current) {
            activeAudioSourceRef.current.stop();
        }
    }
  }, []);

  const displayedPrompt = displayLanguage === 'en' && englishPrompt ? englishPrompt : audioPrompt;
  const imageUrl = `data:${imageInfo.mimeType};base64,${imageInfo.base64}`;

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(displayedPrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [displayedPrompt]);
  
  const handleTranslate = async () => {
    if (isTranslating) return;

    setIsTranslating(true);
    try {
      const translation = await translateToEnglish(audioPrompt);
      setEnglishPrompt(translation);
      setDisplayLanguage('en');
    } catch (error) {
      console.error("Translation failed:", error);
      alert("번역에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsTranslating(false);
    }
  };

  const handleDownloadImage = useCallback(() => {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = 'generated-audio-prompt-image.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [imageUrl]);

  const handleDownloadAudio = useCallback(() => {
    if (!generatedAudioData) return;

    const audioBytes = decode(generatedAudioData);
    const wavBlob = createWavBlob(audioBytes, 1, 24000, 16);
    
    const url = URL.createObjectURL(wavBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `prompt-voice-${voiceSelection}.wav`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [generatedAudioData, voiceSelection]);


  const handlePlayAudio = async () => {
    if (activeAudioSourceRef.current) {
        activeAudioSourceRef.current.stop();
        return;
    }

    if (isGeneratingAudio) return;
    
    setIsGeneratingAudio(true);
    setAudioError(null);
    
    // Don't clear generated audio data if it already exists for the current selection
    if (!generatedAudioData) { 
        try {
            const base64Audio = await generateSpeech(displayedPrompt, voiceSelection);
            setGeneratedAudioData(base64Audio);
            await playDecodedAudio(base64Audio);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.";
            console.error("Audio generation failed:", error);
            setAudioError(errorMessage);
            setIsPlayingAudio(false);
            activeAudioSourceRef.current = null;
        } finally {
            setIsGeneratingAudio(false);
        }
    } else {
        // If audio data already exists, just play it
        try {
            await playDecodedAudio(generatedAudioData);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "오디오 재생에 실패했습니다.";
            console.error("Audio playback failed:", error);
            setAudioError(errorMessage);
        } finally {
            setIsGeneratingAudio(false);
        }
    }
  };

  const playDecodedAudio = async (base64Audio: string) => {
    const audioBytes = decode(base64Audio);

    if (!audioCtxRef.current) {
        throw new Error("오디오 컨텍스트가 초기화되지 않았습니다.");
    }

    const audioBuffer = await decodeAudioData(audioBytes, audioCtxRef.current, 24000, 1);
    
    const source = audioCtxRef.current.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtxRef.current.destination);
    
    activeAudioSourceRef.current = source;
    
    source.onended = () => {
        setIsPlayingAudio(false);
        activeAudioSourceRef.current = null;
    };

    source.start();
    setIsPlayingAudio(true);
  }


  const baseButtonClass = "w-full font-semibold py-2 px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed";
  const activeButtonClass = "bg-indigo-600 text-white";
  const inactiveButtonClass = "bg-slate-700 text-slate-300 hover:bg-slate-600";
  
  const langBaseButtonClass = "flex-1 text-sm font-medium py-1.5 px-3 rounded-md transition-colors duration-200";
  const langActiveButtonClass = "bg-sky-600 text-white";
  const langInactiveButtonClass = "bg-slate-700 text-slate-300 hover:bg-slate-600";

  return (
    <div className="w-full flex flex-col lg:flex-row gap-8 items-start animate-fade-in">
      <div className="w-full lg:w-1/2 flex-shrink-0">
        <h2 className="text-2xl font-bold text-slate-200 mb-4">생성된 이미지</h2>
        <img src={imageUrl} alt="Generated" className="rounded-lg shadow-2xl w-full object-contain" />
        <button
          onClick={handleDownloadImage}
          className="mt-4 w-full bg-teal-600 hover:bg-teal-700 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <DownloadIcon className="w-5 h-5" />
          <span>이미지 다운로드</span>
        </button>
      </div>

      <div className="w-full lg:w-1/2">
         <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-slate-200">✨ 생성된 프롬프트 ✨</h2>
            {englishPrompt && (
              <div className="flex space-x-1 p-0.5 bg-slate-800 rounded-lg border border-slate-700">
                <button
                  onClick={() => setDisplayLanguage('ko')}
                  className={`${langBaseButtonClass} ${displayLanguage === 'ko' ? langActiveButtonClass : langInactiveButtonClass}`}
                >
                  한국어
                </button>
                <button
                  onClick={() => setDisplayLanguage('en')}
                  className={`${langBaseButtonClass} ${displayLanguage === 'en' ? langActiveButtonClass : langInactiveButtonClass}`}
                >
                  English
                </button>
              </div>
            )}
        </div>
        
        <div className="flex space-x-2 mb-4 p-1 bg-slate-900 rounded-lg">
            <button
                onClick={() => onSwitchPrompt(PromptType.VOICE)}
                disabled={isSwitching}
                className={`${baseButtonClass} ${promptType === PromptType.VOICE ? activeButtonClass : inactiveButtonClass}`}
            >
                목소리 프롬프트
            </button>
            <button
                onClick={() => onSwitchPrompt(PromptType.SOUNDSCAPE)}
                disabled={isSwitching}
                className={`${baseButtonClass} ${promptType === PromptType.SOUNDSCAPE ? activeButtonClass : inactiveButtonClass}`}
            >
                사운드스케이프 프롬프트
            </button>
        </div>

        <div className="relative">
          {(isSwitching || isTranslating) && (
            <div className="absolute inset-0 bg-slate-900/80 flex items-center justify-center rounded-lg z-10">
              <Spinner />
            </div>
          )}
          <textarea
            readOnly
            value={displayedPrompt}
            className="w-full h-48 p-4 bg-slate-900 border border-slate-700 rounded-lg text-slate-300 resize-none focus:outline-none"
            aria-live="polite"
          />
          <button
            onClick={handleCopy}
            className="absolute top-3 right-3 bg-slate-700 hover:bg-slate-600 text-slate-300 p-2 rounded-md transition-colors"
            title="프롬프트 복사"
          >
            <ClipboardIcon className="w-5 h-5" />
          </button>
        </div>
        {copied && <p className="text-green-400 text-sm mt-2 text-right">복사되었습니다!</p>}
        
        <p className="text-sm text-slate-400 mt-4">
          {promptType === PromptType.VOICE
            ? "이 프롬프트를 복사하여 ElevenLabs와 같은 AI 음성 생성 서비스에 사용해보세요. 이미지 속 인물에게 생명을 불어넣을 수 있습니다."
            : "이 프롬프트를 복사하여 AI 오디오/음악 생성 서비스에 사용하여 이미지의 분위기에 맞는 사운드를 만들어보세요."
          }
        </p>

        <div className="mt-6 space-y-4">
            {promptType === PromptType.VOICE && (
              <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
                 <div className="mb-3">
                    <label htmlFor="voice-select" className="block text-sm font-medium text-slate-300 mb-1">목소리 선택</label>
                    <div className="relative">
                      <select
                          id="voice-select"
                          value={voiceSelection}
                          onChange={(e) => setVoiceSelection(e.target.value as PrebuiltVoice)}
                          disabled={isRecommendingVoice}
                          className="w-full p-2 bg-slate-700 border border-slate-600 rounded-lg text-white focus:ring-2 focus:ring-indigo-500 appearance-none pr-8"
                      >
                         {isRecommendingVoice ? (
                            <option>AI가 추천하는 중...</option>
                         ) : (
                            <>
                              {recommendedVoices.length > 0 && (
                                <optgroup label="AI 추천 목소리">
                                  {recommendedVoices.map(voiceName => (
                                    <option key={voiceName} value={voiceName}>
                                      {voiceLabelMap[voiceName]}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              <optgroup label="다른 목소리">
                                {allVoices
                                  .filter(v => !recommendedVoices.includes(v.name))
                                  .map(voice => (
                                    <option key={voice.name} value={voice.name}>
                                      {voice.label}
                                    </option>
                                  ))}
                              </optgroup>
                            </>
                         )}
                      </select>
                      {isRecommendingVoice && (
                        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                          <Spinner className="h-4 w-4 text-slate-400" />
                        </div>
                      )}
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handlePlayAudio}
                        disabled={isGeneratingAudio || isRecommendingVoice}
                        className="flex-grow bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:bg-green-800 flex items-center justify-center gap-2"
                        >
                        {isGeneratingAudio ? (
                            <>
                            <Spinner className="h-5 w-5 text-white" />
                            <span>생성 중..</span>
                            </>
                        ) : isPlayingAudio ? (
                            <>
                            <StopIcon className="w-5 h-5" />
                            <span>중지</span>
                            </>
                        ) : (
                            <>
                            <SpeakerIcon className="w-5 h-5" />
                            <span>들어보기</span>
                            </>
                        )}
                    </button>
                    <button
                        onClick={handleDownloadAudio}
                        disabled={!generatedAudioData}
                        title="생성된 음성 다운로드"
                        className="flex-shrink-0 bg-teal-600 hover:bg-teal-700 text-white font-bold p-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-teal-800 flex items-center justify-center"
                    >
                        <DownloadIcon className="w-5 h-5" />
                    </button>
                </div>

                {audioError && <p className="text-red-400 text-sm text-center mt-2">{audioError}</p>}
              </div>
            )}
            {!englishPrompt && (
            <button
                onClick={handleTranslate}
                disabled={isTranslating}
                className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:bg-sky-800 flex items-center justify-center gap-2"
            >
                {isTranslating ? (
                    <>
                        <Spinner className="h-5 w-5 text-white" />
                        <span>번역 중...</span>
                    </>
                ) : (
                    <>
                        <TranslateIcon className="w-5 h-5" />
                        <span>영어로 번역하기</span>
                    </>
                )}
            </button>
            )}
            <button
            onClick={onReset}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105"
            >
            새로 만들기
            </button>
        </div>
      </div>
    </div>
  );
};

export default ResultDisplay;