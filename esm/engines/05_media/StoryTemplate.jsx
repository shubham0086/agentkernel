/**
 * Universal Remotion React Composition for any story.
 * Ported from my-video services.
 */

import React, { useEffect, useState } from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';

// Styles & Themes
const THEMES = {
  classic: {
    primary: '#FFD700', // Gold
    secondary: '#A5D6A7',
    text: '#FFFFFF',
    bg: 'rgba(0,0,0,0.68)',
    font: 'Georgia, serif',
    border: '5px solid #FFD700',
  },
  modern: {
    primary: '#00F2FF', // Cyan
    secondary: '#E0F7FA',
    text: '#FFFFFF',
    bg: 'rgba(10, 20, 40, 0.75)',
    font: 'Inter, system-ui, sans-serif',
    border: '3px solid #00F2FF',
    glow: '0 0 20px rgba(0,242,255,0.5)',
  }
};

const TITLE_FRAMES = 150; // 5 seconds title card
const AUDIO_DELAY = 60;  // 2 seconds audio delay
const LABEL_DELAY = 20;
const CAPTION_DELAY = 50;
const FADE_DURATION = 18;

const KB_DEFAULTS = [
  { from: 1.0, to: 1.08 }, { from: 1.08, to: 1.0 },
  { from: 1.02, to: 1.1 }, { from: 1.1, to: 1.02 },
  { from: 1.0, to: 1.12 }
];

function KenBurnsImage({ src, lf, total, index, kb, opacity }) {
  const cfg = kb ?? KB_DEFAULTS[index % KB_DEFAULTS.length];
  const scale = interpolate(lf, [0, total], [cfg.from, cfg.to], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const panX = interpolate(lf, [0, total], [0, cfg.panX ?? 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const panY = interpolate(lf, [0, total], [0, cfg.panY ?? 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const fade = opacity ?? interpolate(lf, [0, FADE_DURATION, total - FADE_DURATION, total], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ overflow: 'hidden', opacity: fade }}>
      <Img
        src={staticFile(src)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${scale}) translate(${panX}px, ${panY}px)` }}
      />
    </AbsoluteFill>
  );
}

function TitleCard({ scene, title, subtitle, collection, lf }) {
  const cardOpacity = interpolate(lf, [0, 25, TITLE_FRAMES - 25, TITLE_FRAMES], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleY = interpolate(lf, [15, 45], [40, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleOp = interpolate(lf, [15, 45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const subOp = interpolate(lf, [45, 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const tagOp = interpolate(lf, [5, 25], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const isModern = title.toLowerCase().includes('ai') || title.toLowerCase().includes('tech') || title.toLowerCase().includes('origin');
  const theme = isModern ? THEMES.modern : THEMES.classic;

  return (
    <AbsoluteFill>
      <KenBurnsImage
        src={scene.image} lf={lf} total={TITLE_FRAMES}
        index={0} kb={{ from: 1.0, to: 1.06 }} opacity={1}
      />
      <AbsoluteFill style={{
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.75) 100%)',
      }} />

      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        opacity: cardOpacity,
      }}>
        <div style={{
          background: theme.bg,
          backdropFilter: 'blur(16px)',
          borderRadius: 28,
          padding: '52px 64px',
          borderTop: theme.border,
          borderBottom: theme.border,
          textAlign: 'center',
          maxWidth: 920,
          marginInline: 60,
          boxShadow: isModern ? theme.glow : '0 0 80px rgba(0,0,0,0.6)',
        }}>
          {collection && (
            <p style={{
              fontFamily: theme.font, fontSize: 36, color: theme.primary,
              letterSpacing: 6, textTransform: 'uppercase', margin: '0 0 20px',
              opacity: tagOp,
            }}>
              {collection}
            </p>
          )}

          <h1 style={{
            fontFamily: theme.font, fontSize: 84, fontWeight: 'bold',
            color: theme.text, margin: '0 0 24px', lineHeight: 1.15,
            textShadow: isModern ? theme.glow : '0 0 40px rgba(255,215,0,0.35)',
            opacity: titleOp, transform: `translateY(${titleY}px)`,
          }}>
            {title}
          </h1>

          {subtitle && (
            <p style={{
              fontFamily: theme.font, fontSize: 46, color: theme.secondary,
              fontStyle: isModern ? 'normal' : 'italic', margin: 0, opacity: subOp,
            }}>
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
}

function SceneLabel({ text, lf }) {
  const opacity = interpolate(lf, [LABEL_DELAY, LABEL_DELAY + 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const y = interpolate(lf, [LABEL_DELAY, LABEL_DELAY + 18], [-16, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', top: 80, left: 0, right: 0, textAlign: 'center', opacity, transform: `translateY(${y}px)` }}>
      <span style={{
        fontFamily: 'Georgia, serif', fontSize: 40, fontWeight: 'bold',
        color: '#FFD700', textTransform: 'uppercase', letterSpacing: 4,
        textShadow: '0 0 20px rgba(0,0,0,0.9), 2px 2px 4px #000',
        padding: '8px 28px', background: 'rgba(0,0,0,0.42)', borderRadius: 10,
      }}>
        {text}
      </span>
    </div>
  );
}

function Caption({ text, lf }) {
  const opacity = interpolate(lf, [CAPTION_DELAY, CAPTION_DELAY + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      padding: '32px 48px 64px',
      borderTop: '4px solid #FFD700',
      background: 'linear-gradient(to top, rgba(0,0,0,0.94) 0%, rgba(0,0,0,0.72) 65%, transparent 100%)',
      opacity,
    }}>
      <p style={{
        fontFamily: 'Georgia, serif', fontSize: 52, lineHeight: 1.5,
        color: '#FFF', margin: 0, textShadow: '1px 1px 3px rgba(0,0,0,0.9)',
      }}>
        {text}
      </p>
    </div>
  );
}

function MoralCard({ text, lf, title }) {
  const isModern = title.toLowerCase().includes('ai') || title.toLowerCase().includes('tech') || title.toLowerCase().includes('origin');
  const theme = isModern ? THEMES.modern : THEMES.classic;
  const opacity = interpolate(lf, [60, 90], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const parts = text.split('\n');

  return (
    <div style={{ position: 'absolute', bottom: 180, left: 60, right: 60, opacity }}>
      <div style={{
        background: theme.bg, borderRadius: 20, padding: '36px 44px',
        borderTop: theme.border, borderBottom: theme.border, textAlign: 'center',
        boxShadow: isModern ? theme.glow : '0 0 40px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(10px)',
      }}>
        <p style={{ fontFamily: theme.font, fontSize: 32, color: theme.primary, textTransform: 'uppercase', letterSpacing: 3, margin: '0 0 12px' }}>
          {text.includes('Moral') ? 'The Moral' : 'The Takeaway'}
        </p>
        {parts.map((p, i) => (
          <p key={i} style={{
            fontFamily: theme.font,
            fontSize: i === 0 ? 64 : 44,
            fontWeight: i === 0 ? 'bold' : 'normal',
            color: i === 0 ? theme.text : theme.secondary,
            fontStyle: (!isModern && i > 0) ? 'italic' : 'normal',
            margin: i === 0 ? '0 0 14px' : 0, lineHeight: 1.2,
          }}>
            {p}
          </p>
        ))}
      </div>
    </div>
  );
}

export const StoryTemplate = ({ folder, sceneDurationFrames = 360, manifest: injectedManifest }) => {
  const frame = useCurrentFrame();
  const [manifest, setManifest] = useState(injectedManifest || null);

  useEffect(() => {
    if (injectedManifest) return;
    fetch(staticFile(`${folder}/manifest.json`))
      .then(r => r.json())
      .then(setManifest)
      .catch(console.error);
  }, [folder, injectedManifest]);

  if (!manifest) return <AbsoluteFill style={{ backgroundColor: '#000' }} />;

  const hasBgMusic = !!manifest.bgMusic;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {hasBgMusic && (
        <Audio src={staticFile(manifest.bgMusic)} volume={0.2} loop />
      )}

      {/* Title Card */}
      <Sequence from={0} durationInFrames={TITLE_FRAMES}>
        <TitleCard
          scene={manifest.scenes[0]}
          title={manifest.title}
          subtitle={manifest.subtitle}
          collection={manifest.collection}
          lf={frame}
        />
      </Sequence>

      {/* Story Scenes */}
      {manifest.scenes.map((scene, i) => {
        const startFrame = TITLE_FRAMES + i * sceneDurationFrames;
        const lf = frame - startFrame;
        const isLast = i === manifest.scenes.length - 1;

        return (
          <Sequence key={scene.id} from={startFrame} durationInFrames={sceneDurationFrames}>
            <KenBurnsImage
              src={scene.image} lf={lf}
              total={sceneDurationFrames} index={i}
              kb={scene.kenBurns}
            />
            <AbsoluteFill style={{
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.48) 0%, transparent 20%, transparent 58%, rgba(0,0,0,0.82) 100%)',
              pointerEvents: 'none'
            }} />
            <SceneLabel text={scene.label} lf={lf} />
            <Caption text={scene.narration} lf={lf} />

            {isLast && scene.moral && <MoralCard text={scene.moral} lf={lf} title={manifest.title} />}

            {/* Narration audio track */}
            <Sequence from={AUDIO_DELAY}>
              <Audio src={staticFile(scene.audio)} volume={0.95} />
            </Sequence>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
export default StoryTemplate;
