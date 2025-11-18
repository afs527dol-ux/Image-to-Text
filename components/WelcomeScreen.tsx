import React, { useState, useRef } from 'react';
import { UploadIcon } from './icons/UploadIcon';

interface WelcomeScreenProps {
  onGenerateSubmit: (prompt: string) => void;
  onImageUpload: (file: File) => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onGenerateSubmit, onImageUpload }) => {
  const [prompt, setPrompt] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImageUpload(file);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onGenerateSubmit(prompt);
  };

  return (
    <div className="w-full max-w-2xl text-center">
      <div className="bg-slate-800 p-8 rounded-xl border border-slate-700 shadow-lg mb-8">
        <h2 className="text-2xl font-bold text-indigo-400 mb-4">1. 이미지 만들기</h2>
        <p className="text-slate-400 mb-6">어떤 장면을 소리로 만들고 싶으신가요? 상상하는 모습을 글로 설명해주세요.</p>
        <form onSubmit={handleSubmit}>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="예시: 비 오는 날 창 밖을 바라보는 고양이"
            className="w-full p-3 bg-slate-900 border border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors h-24 resize-none"
          />
          <button
            type="submit"
            className="mt-4 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105"
          >
            이미지 생성하기
          </button>
        </form>
      </div>

      <div className="relative flex py-5 items-center">
        <div className="flex-grow border-t border-slate-700"></div>
        <span className="flex-shrink mx-4 text-slate-500">또는</span>
        <div className="flex-grow border-t border-slate-700"></div>
      </div>

      <div className="bg-slate-800 p-8 rounded-xl border border-slate-700 shadow-lg">
        <h2 className="text-2xl font-bold text-purple-400 mb-4">2. 가지고 있는 이미지 사용하기</h2>
        <p className="text-slate-400 mb-6">컴퓨터에 저장된 이미지를 선택해서 오디오 프롬프트를 만들 수 있어요.</p>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="image/*"
        />
        <button
          onClick={handleUploadClick}
          className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105 flex items-center justify-center gap-2"
        >
          <UploadIcon className="w-6 h-6" />
          컴퓨터에서 이미지 선택
        </button>
      </div>
    </div>
  );
};

export default WelcomeScreen;
