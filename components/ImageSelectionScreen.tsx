import React from 'react';
import type { ImageInfo } from '../types';
import { RefreshIcon } from './icons/RefreshIcon';

interface ImageSelectionScreenProps {
  images: ImageInfo[];
  onSelectImage: (image: ImageInfo) => void;
  onRegenerate: () => void;
}

const ImageSelectionScreen: React.FC<ImageSelectionScreenProps> = ({ images, onSelectImage, onRegenerate }) => {
  return (
    <div className="w-full text-center animate-fade-in">
      <h2 className="text-3xl font-bold text-indigo-400 mb-2">마음에 드는 이미지를 선택하세요</h2>
      <p className="text-slate-400 mb-8">선택한 이미지를 바탕으로 오디오 프롬프트를 생성합니다.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {images.map((image, index) => (
          <div 
            key={index}
            className="group relative cursor-pointer rounded-lg overflow-hidden border-2 border-transparent hover:border-indigo-500 transition-all duration-300"
            onClick={() => onSelectImage(image)}
            role="button"
            tabIndex={0}
            aria-label={`이미지 ${index + 1} 선택`}
            onKeyDown={(e) => e.key === 'Enter' && onSelectImage(image)}
          >
            <img 
              src={`data:${image.mimeType};base64,${image.base64}`} 
              alt={`Generated image ${index + 1}`}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-black/40 group-hover:bg-black/60 transition-all duration-300 flex items-center justify-center">
              <span className="text-white text-lg font-bold opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                선택하기
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <button
          onClick={onRegenerate}
          className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg transition-transform transform hover:scale-105 flex items-center justify-center gap-2 mx-auto"
        >
          <RefreshIcon className="w-5 h-5" />
          다시 생성하기
        </button>
      </div>
    </div>
  );
};

export default ImageSelectionScreen;