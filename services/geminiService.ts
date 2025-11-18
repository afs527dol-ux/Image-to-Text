import { GoogleGenAI, Modality } from "@google/genai";
import type { ImageInfo } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY 환경 변수가 설정되지 않았습니다.");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Gemini API 오류를 처리하고 사용자 친화적인 메시지를 생성합니다.
 * @param error 발생한 오류 객체
 * @param defaultMessage 기본 오류 메시지
 * @returns Error 객체
 */
function handleGeminiError(error: any, defaultMessage: string): Error {
    console.error("Gemini API 오류:", error);
    let userMessage = defaultMessage;
    
    // @google/genai SDK는 HTTP 오류 세부 정보를 포함한 오류를 발생시킬 수 있습니다.
    // 문자열 검사는 정확한 오류 객체 구조를 알지 못해도 안정적으로 처리할 수 있는 방법입니다.
    const errorMessage = (error instanceof Error ? error.message : String(error)).toLowerCase();

    if (errorMessage.includes('429') || errorMessage.includes('resource_exhausted')) {
        userMessage = "API 사용 할당량을 초과했습니다. 잠시 후 다시 시도하거나 API 요금제를 확인해주세요.";
    } else if (errorMessage.includes('api key not valid') || errorMessage.includes('permission_denied')) {
        userMessage = "API 키가 유효하지 않거나 권한이 없습니다. 올바른 API 키가 설정되었는지 확인해주세요.";
    } else if (errorMessage.includes('500') || errorMessage.includes('503') || errorMessage.includes('internal')) {
        userMessage = "서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.";
    }
    
    return new Error(userMessage);
}

export type PrebuiltVoice = 'Kore' | 'Puck' | 'Zephyr' | 'Charon' | 'Fenrir';


/**
 * 주어진 텍스트 프롬프트로 이미지를 생성합니다.
 * @param prompt 이미지 생성을 위한 텍스트 설명
 * @returns 생성된 이미지의 base64 데이터와 mime 타입을 포함하는 객체의 배열
 */
export const generateImage = async (prompt: string): Promise<ImageInfo[]> => {
  try {
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: `digital art, high quality, ${prompt}`,
      config: {
        numberOfImages: 3,
        outputMimeType: 'image/png',
        aspectRatio: '16:9',
      },
    });

    if (!response.generatedImages || response.generatedImages.length === 0) {
      throw new Error("API에서 이미지를 반환하지 않았습니다.");
    }

    return response.generatedImages.map(img => ({
      base64: img.image.imageBytes,
      mimeType: 'image/png',
    }));
  } catch (error) {
    throw handleGeminiError(error, "이미지 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
  }
};

/**
 * 주어진 이미지를 분석하여 AI 음성 생성을 위한 '목소리' 프롬프트를 생성합니다.
 * @param base64Image 분석할 이미지의 base64 인코딩된 데이터
 * @param mimeType 이미지의 MIME 타입
 * @returns 생성된 목소리 프롬프트 텍스트
 */
export const generateVoicePromptFromImage = async (base64Image: string, mimeType: string): Promise<string> => {
  try {
    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType: mimeType,
      },
    };

    const textPart = {
      text: `당신은 ElevenLabs의 상세한 프롬프트 가이드에 기반하여 AI 음성 생성용 프롬프트를 만드는 전문가입니다. 주어진 이미지를 분석하여, 이미지 속 중심 인물이나 대상에 대한 상세한 목소리 묘사 프롬프트를 생성하는 것이 당신의 임무입니다. 배경은 완전히 무시하세요. 결과물은 ElevenLabs에 바로 사용할 수 있도록, 자연스럽게 이어지는 하나의 문단 형태의 한국어 텍스트여야 합니다.
ElevenLabs 가이드를 참고하여 다음 속성들을 포함시켜 주세요:
- **나이와 성별**: (예: 중년 남성, 젊은 여성)
- **억양**: (예: 부드러운 영국식 억양, 강한 남부 사투리, 중립적인 미국식 억양)
- **톤과 음색**: (예: 깊고 울림 있는, 거칠고 쉰, 부드럽고 따뜻한, 비음이 섞인)
- **속도**: (예: 말이 빠름, 느리고 신중함, 자연스러운 대화 속도)
- **감정과 분위기**: (예: 활기찬, 냉소적인, 차분한, 신비로운, 권위 있는)
- **오디오 품질**: 프롬프트에 'studio-quality recording' 또는 'perfect audio quality'와 같이 높은 오디오 품질을 언급하는 내용을 포함하세요.

이제 이미지를 분석하여 프롬프트를 생성하세요.`
    };

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, textPart] },
    });
    
    return response.text.trim();
  } catch (error) {
    throw handleGeminiError(error, "이미지를 분석하여 목소리 프롬프트를 생성하는 데 실패했습니다.");
  }
};


/**
 * 주어진 이미지를 분석하여 오디오 생성을 위한 '사운드스케이프' 프롬프트를 생성합니다.
 * @param base64Image 분석할 이미지의 base64 인코딩된 데이터
 * @param mimeType 이미지의 MIME 타입
 * @returns 생성된 사운드스케이프 프롬프트 텍스트
 */
export const generateSoundscapePromptFromImage = async (base64Image: string, mimeType: string): Promise<string> => {
  try {
    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType: mimeType,
      },
    };

    const textPart = {
      text: `이 이미지의 전반적인 분위기와 환경에 어울리는 '사운드스케이프' 또는 '배경음악'을 설명하는 프롬프트를 생성해줘. 이 프롬프트는 오디오 생성 AI에서 사용될 거야. 이미지 속 모든 요소를 고려해줘. 결과물에는 다음 요소들이 포함될 수 있도록 한국어로 작성해줘:
1. **핵심 환경음 (Key Ambience)**: (예: 비 내리는 소리, 붐비는 도시의 소음, 조용한 숲 속의 바람 소리)
2. **구체적인 사물 소리 (Specific Sound Effects)**: (예: 멀리서 들리는 사이렌 소리, 찻잔이 달그락거리는 소리, 장작이 타는 소리)
3. **음악적 요소 (Musical Elements)**: (예: 잔잔한 피아노 선율, 웅장한 오케스트라, 긴장감 있는 신디사이저 사운드)
4. **전체적인 분위기 (Overall Mood)**: (예: 평화롭고 안정적인, 긴장되고 불안한, 신비롭고 몽환적인)
최종 결과는 바로 오디오 생성 AI에 붙여넣을 수 있는 완성된 문장 형태여야 해.`
    };

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [imagePart, textPart] },
    });
    
    return response.text.trim();
  } catch (error) {
    throw handleGeminiError(error, "이미지를 분석하여 사운드스케이프 프롬프트를 생성하는 데 실패했습니다.");
  }
};

/**
 * 주어진 텍스트를 영어로 번역합니다.
 * @param text 번역할 한국어 텍스트
 * @returns 번역된 영어 텍스트
 */
export const translateToEnglish = async (text: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Translate the following Korean text into natural, fluent English. The context is a prompt for an AI voice or audio generation service. Preserve the key descriptive terms and structure as much as possible.\n\nKorean Text:\n"""\n${text}\n"""\n\nEnglish Translation:`,
      config: {
        temperature: 0.2, 
      }
    });
    return response.text.trim();
  } catch (error)
 {
    throw handleGeminiError(error, "텍스트를 영어로 번역하는 데 실패했습니다.");
  }
};

/**
 * 주어진 텍스트 프롬프트로 음성을 생성합니다.
 * @param text 음성으로 변환할 텍스트
 * @param voiceName 사용할 목소리 이름
 * @returns 생성된 오디오의 base64 데이터
 */
export const generateSpeech = async (text: string, voiceName: PrebuiltVoice = 'Kore'): Promise<string> => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName },
              },
          },
        },
      });
  
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  
      if (!base64Audio) {
        throw new Error("API에서 오디오 데이터를 반환하지 않았습니다.");
      }
  
      return base64Audio;
  
    } catch (error) {
      throw handleGeminiError(error, "음성 생성에 실패했습니다. 잠시 후 다시 시도해주세요.");
    }
  };
  
/**
 * 주어진 목소리 프롬프트를 분석하여 가장 적합한 사전 설정된 목소리를 최대 3개까지 추천합니다.
 * @param audioPrompt 분석할 목소리 프롬프트
 * @returns 추천된 목소리 이름의 배열
 */
export const recommendVoicesFromPrompt = async (audioPrompt: string): Promise<PrebuiltVoice[]> => {
    try {
        const prompt = `당신은 전문가 보이스 캐스팅 디렉터 AI입니다. 당신의 임무는 주어진 목소리 프롬프트를 분석하여, 가장 적합한 성별을 결정하고, 해당 성별의 목소리를 제공된 목록에서 최대 3개까지 추천하는 것입니다.

사용 가능한 목소리:
- 여성 목소리:
    - 'Kore': 차분하고 선명한 여성 목소리.
- 남성 목소리:
    - 'Puck': 중립적이고 안정적인 남성 목소리.
    - 'Zephyr': 따뜻하고 부드러운 남성 목소리.
    - 'Charon': 깊고 낮은 남성 목소리.
    - 'Fenrir': 강하고 활기찬 남성 목소리.

지침:
1. 아래의 목소리 프롬프트를 읽어주세요.
2. '남성' 또는 '여성' 목소리가 더 적합한지 결정하세요.
3. 선택된 성별에 해당하는 목록에서 가장 적합한 목소리를 최대 3개까지 선택하세요. 해당 성별의 목소리가 하나뿐이라면 그것만 선택하세요.
4. 적합성 순서대로 쉼표로 구분된 목소리 이름 목록으로만 응답하세요. 다른 텍스트, 설명 또는 따옴표를 포함하지 마세요.

예시 응답: Charon,Puck,Zephyr

분석할 목소리 프롬프트:
"""
${audioPrompt}
"""

쉼표로 구분된 당신의 목소리 추천:`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { temperature: 0.1 }
        });

        const recommendationString = response.text.trim();
        const validVoices: PrebuiltVoice[] = ['Kore', 'Puck', 'Zephyr', 'Charon', 'Fenrir'];
        
        const recommendedVoices = recommendationString
            .split(',')
            .map(v => v.trim())
            .filter(v => validVoices.includes(v as PrebuiltVoice)) as PrebuiltVoice[];

        if (recommendedVoices.length > 0) {
            return recommendedVoices;
        } else {
            console.warn("AI로부터 유효한 목소리 추천을 받지 못했습니다:", recommendationString);
            // 프롬프트에 '여성' 또는 '여자'가 포함되어 있는지 간단히 확인하여 기본값 결정
            if (/여성|여자/.test(audioPrompt)) {
              return ['Kore'];
            }
            return ['Puck', 'Zephyr', 'Charon']; // 안전한 남성 기본값
        }

    } catch (error) {
        console.error("Gemini 목소리 추천 오류:", error);
        // 오류 발생 시 안전한 기본값 반환
        if (/여성|여자/.test(audioPrompt)) {
          return ['Kore'];
        }
        return ['Puck', 'Zephyr', 'Charon'];
    }
};