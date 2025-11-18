import React, { useState, useCallback } from 'react';
import { AppState, PromptType } from './types';
import type { ImageInfo } from './types';
import { generateImage, generateVoicePromptFromImage, generateSoundscapePromptFromImage } from './services/geminiService';
import WelcomeScreen from './components/WelcomeScreen';
import ResultDisplay from './components/ResultDisplay';
import Spinner from './components/Spinner';
import { SparklesIcon } from './components/icons/SparklesIcon';
import ImageSelectionScreen from './components/ImageSelectionScreen';

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [generatedImages, setGeneratedImages] = useState<ImageInfo[]>([]);
  const [selectedImage, setSelectedImage] = useState<ImageInfo | null>(null);
  const [audioPrompt, setAudioPrompt] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [promptType, setPromptType] = useState<PromptType>(PromptType.VOICE);
  const [isSwitchingPrompt, setIsSwitchingPrompt] = useState<boolean>(false);
  const [lastPrompt, setLastPrompt] = useState<string>('');

  const handleError = (message: string, error?: any) => {
    console.error(message, error);
    setError(message);
    setAppState(AppState.ERROR);
  };

  const handleGenerateImage = async (prompt: string) => {
    if (!prompt) {
      handleError("이미지 생성을 위한 설명을 입력해주세요.");
      return;
    }
    setLastPrompt(prompt);
    setAppState(AppState.GENERATING_IMAGE);
    setLoadingMessage('AI가 멋진 이미지를 만들고 있어요...');
    setError(null);
    setGeneratedImages([]);
    setSelectedImage(null);

    try {
      const images = await generateImage(prompt);
      setGeneratedImages(images);
      setAppState(AppState.SELECTING_IMAGE);
    } catch (err) {
      handleError("이미지 생성 중 오류가 발생했습니다.", err);
    }
  };

  const handleRegenerateImages = () => {
    if (lastPrompt) {
      handleGenerateImage(lastPrompt);
    } else {
      handleError("재생성할 프롬프트가 없습니다. 다시 시작해주세요.");
    }
  };

  const analyzeAndGeneratePrompt = async (image: ImageInfo) => {
    setAppState(AppState.ANALYZING_IMAGE);
    setLoadingMessage('이미지를 분석하여 목소리 프롬프트를 생성 중입니다...');
    try {
      const newAudioPrompt = await generateVoicePromptFromImage(image.base64, image.mimeType);
      setAudioPrompt(newAudioPrompt);
      setPromptType(PromptType.VOICE);
      setAppState(AppState.SHOWING_RESULT);
    } catch (err) {
      handleError("이미지 분석 중 오류가 발생했습니다.", err);
    }
  };

  const handleImageSelect = async (image: ImageInfo) => {
    setSelectedImage(image);
    await analyzeAndGeneratePrompt(image);
  };

  const handleImageUpload = (file: File) => {
    setError(null);
    setGeneratedImages([]);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64String = event.target?.result as string;
      if (base64String) {
        const base64Data = base64String.split(',')[1];
        const imageInfo = { base64: base64Data, mimeType: file.type };
        setSelectedImage(imageInfo);
        await analyzeAndGeneratePrompt(imageInfo);
      } else {
        handleError("파일을 읽는 데 실패했습니다.");
      }
    };
    reader.onerror = (error) => {
      handleError("파일 읽기 오류가 발생했습니다.", error);
    };
    reader.readAsDataURL(file);
  };

  const handleSwitchPromptType = async (newType: PromptType) => {
    if (!selectedImage || isSwitchingPrompt || newType === promptType) return;

    setIsSwitchingPrompt(true);
    setError(null);
    
    try {
      let newPrompt = '';
      if (newType === PromptType.VOICE) {
        newPrompt = await generateVoicePromptFromImage(selectedImage.base64, selectedImage.mimeType);
      } else {
        newPrompt = await generateSoundscapePromptFromImage(selectedImage.base64, selectedImage.mimeType);
      }
      setAudioPrompt(newPrompt);
      setPromptType(newType);
    } catch (err) {
      setAudioPrompt(`프롬프트 생성 중 오류 발생: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSwitchingPrompt(false);
    }
  };

  const handleReset = useCallback(() => {
    setAppState(AppState.IDLE);
    setSelectedImage(null);
    setGeneratedImages([]);
    setAudioPrompt('');
    setError(null);
    setLoadingMessage('');
    setPromptType(PromptType.VOICE);
    setLastPrompt('');
  }, []);

  const renderContent = () => {
    switch (appState) {
      case AppState.IDLE:
        return <WelcomeScreen onGenerateSubmit={handleGenerateImage} onImageUpload={handleImageUpload} />;
      
      case AppState.GENERATING_IMAGE:
        return (
          <div className="flex flex-col items-center justify-center text-center h-full">
            <Spinner />
            <p className="mt-4 text-lg text-slate-300 animate-pulse">{loadingMessage}</p>
          </div>
        );

      case AppState.SELECTING_IMAGE:
        return <ImageSelectionScreen images={generatedImages} onSelectImage={handleImageSelect} onRegenerate={handleRegenerateImages} />;

      case AppState.ANALYZING_IMAGE:
        return (
          <div className="flex flex-col items-center justify-center text-center h-full">
            <Spinner />
            <p className="mt-4 text-lg text-slate-300 animate-pulse">{loadingMessage}</p>
            {selectedImage && (
              <img src={`data:${selectedImage.mimeType};base64,${selectedImage.base64}`} alt="분석 중인 이미지" className="mt-8 rounded-lg shadow-2xl max-w-sm max-h-96 object-contain" />
            )}
          </div>
        );

      case AppState.SHOWING_RESULT:
        if (selectedImage) {
          return (
            <ResultDisplay 
              imageInfo={selectedImage} 
              audioPrompt={audioPrompt} 
              onReset={handleReset}
              promptType={promptType}
              onSwitchPrompt={handleSwitchPromptType}
              isSwitching={isSwitchingPrompt}
            />
          );
        }
        handleReset();
        return null;

      case AppState.ERROR:
        return (
          <div className="text-center bg-red-900/50 border border-red-600 p-8 rounded-lg">
            <h2 className="text-2xl font-bold text-red-400 mb-4">오류 발생</h2>
            <p className="text-red-300">{error}</p>
            <button
              onClick={handleReset}
              className="mt-6 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
              다시 시작하기
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 font-sans">
      <div className="w-full max-w-4xl mx-auto">
        <header className="text-center mb-10">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-indigo-500 flex items-center justify-center gap-3">
            <SparklesIcon className="w-10 h-10" />
            이미지로 오디오 프롬프트 만들기
          </h1>
          <p className="mt-4 text-lg text-slate-400 max-w-2xl mx-auto">
            AI로 이미지를 만들고, 그 장면에 어울리는 목소리나 사운드스케이프 프롬프트를 생성해보세요.
          </p>
        </header>
        <main className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl shadow-2xl p-6 sm:p-8 lg:p-12 min-h-[500px] flex items-center justify-center">
          {renderContent()}
        </main>
        <footer className="text-center mt-8 text-slate-500 text-sm">
          <p>Powered by Google Gemini</p>
        </footer>
      </div>
    </div>
  );
};

export default App;