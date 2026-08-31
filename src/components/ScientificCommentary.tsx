/**
 * 科学家观察员发言组件
 *
 * 与 AITrashTalk（右下角敌方蚁后）形成对照：
 * - 位于左下角
 * - 配色：科研冷色（cyan / slate）
 * - 头像：🔬 显微镜
 * - 风格：客观、实验记录腔（与蚁后的"嘴硬挑衅"完全相反）
 *
 * 显示逻辑：10s 后淡出 0.8s，可手动关闭。
 *
 * 文本解析：scientificCommentary 可能含 ::HIGHLIGHT::xxx 标记，
 * UI 把它拆成正文 + 关注高亮。
 */

import React, { useEffect, useState, useRef } from 'react';
import { useGameStore } from '../store/gameStore';

const DISPLAY_DURATION = 10000;
const FADE_DURATION = 800;
const HIGHLIGHT_MARKER = '::HIGHLIGHT::';

function parseCommentary(raw: string): { text: string; highlight?: string } {
  const idx = raw.indexOf(HIGHLIGHT_MARKER);
  if (idx === -1) return { text: raw };
  return {
    text: raw.slice(0, idx).trim(),
    highlight: raw.slice(idx + HIGHLIGHT_MARKER.length).trim() || undefined,
  };
}

export const ScientificCommentary: React.FC = () => {
  const { scientificCommentary, scientificCommentaryTime } = useGameStore();
  const [visible, setVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const [currentText, setCurrentText] = useState('');
  const [currentHighlight, setCurrentHighlight] = useState<string | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timerRef.current.forEach((t) => clearTimeout(t));
    timerRef.current = [];
  };

  useEffect(() => {
    if (!scientificCommentary || scientificCommentaryTime === 0) return;
    clearTimers();

    const parsed = parseCommentary(scientificCommentary);
    setCurrentText(parsed.text);
    setCurrentHighlight(parsed.highlight);
    setFadeOut(false);
    setVisible(true);

    const fadeTimer = setTimeout(() => setFadeOut(true), DISPLAY_DURATION);
    timerRef.current.push(fadeTimer);

    const hideTimer = setTimeout(() => {
      setVisible(false);
      setFadeOut(false);
    }, DISPLAY_DURATION + FADE_DURATION);
    timerRef.current.push(hideTimer);

    return () => clearTimers();
  }, [scientificCommentary, scientificCommentaryTime]);

  const handleDismiss = () => {
    clearTimers();
    setFadeOut(true);
    const t = setTimeout(() => {
      setVisible(false);
      setFadeOut(false);
    }, FADE_DURATION);
    timerRef.current.push(t);
  };

  if (!visible || !currentText) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`
        fixed bottom-32 left-6 z-40
        w-[400px] max-w-[calc(100vw-3rem)]
        transition-all duration-700 ease-out
        ${fadeOut
          ? 'opacity-0 translate-y-3 scale-95'
          : 'opacity-100 translate-y-0 scale-100'}
      `}
    >
      <div className="flex flex-col items-start gap-2">
        {/* 科学家头像 */}
        <div
          className="
            shrink-0
            w-14 h-14 rounded-full
            bg-gradient-to-br from-slate-700 via-slate-800 to-cyan-950
            border-2 border-cyan-400/80
            shadow-lg shadow-cyan-500/50
            flex items-center justify-center
            text-3xl
            ring-2 ring-cyan-500/30 ring-offset-2 ring-offset-transparent
          "
          aria-hidden="true"
        >
          🔬
        </div>

        {/* 气泡主体 */}
        <div className="relative w-full">
          {/* 气泡尾巴 */}
          <div
            className="
              absolute -top-1.5 left-6
              w-3 h-3
              bg-gradient-to-br from-gray-950 to-cyan-950
              border-t-2 border-l-2 border-cyan-500/60
              transform rotate-45
            "
            aria-hidden="true"
          />
          <div
            className="
              relative
              px-5 py-4
              rounded-2xl rounded-tl-sm
              bg-gradient-to-br from-gray-950/95 to-cyan-950/95
              border-2 border-cyan-500/60
              backdrop-blur-md
              shadow-2xl shadow-cyan-500/40
            "
          >
            {/* 头部：标签 + 关闭按钮 */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-cyan-300 text-sm font-bold tracking-wide font-game">
                  科学家观察员
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wider text-cyan-200 bg-cyan-900/60 border border-cyan-700/50">
                  实验记录
                </span>
                <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              </div>
              <button
                onClick={handleDismiss}
                className="
                  -mr-1 -mt-1 w-6 h-6 rounded
                  flex items-center justify-center
                  text-cyan-300/60 hover:text-cyan-100 hover:bg-cyan-900/40
                  transition-colors
                  text-sm leading-none
                "
                aria-label="关闭科学家观察记录"
                title="关闭"
              >
                ×
              </button>
            </div>

            {/* 评语正文 */}
            <p className="text-gray-100 text-sm leading-6 font-game italic pl-1 pr-2">
              {currentText}
            </p>

            {/* 关注提示（可选） */}
            {currentHighlight && (
              <div className="mt-2 px-2 py-1 rounded text-xs font-game bg-cyan-900/30 border border-cyan-700/40 text-cyan-200">
                👁 关注：{currentHighlight}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};