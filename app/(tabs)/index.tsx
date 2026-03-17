import { useState, useCallback } from 'react';
import { StyleSheet, Pressable, Platform, View as RNView } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import Slider from '@react-native-community/slider';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';

import { Text, View } from '@/components/Themed';

const NUM_BARS = 20;
const WAVEFORM_BARS = 40;
const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// ─── Types ─────────────────────────────────────────────────────────────────
type VisMode = 'bars' | 'waveform' | 'circular';
type ColorScheme = 'black' | 'blue' | 'colorful';

// ─── Color scheme logic ────────────────────────────────────────────────────
// intensity: 0..1 (based on simulated "volume" / bar height ratio)
function getBarColor(
  scheme: ColorScheme,
  index: number,
  total: number,
  intensity: number // 0..1
): string {
  switch (scheme) {
    case 'black':
      // White → grey depending on intensity
      const lightness = Math.round(30 + intensity * 60);
      return `hsl(0, 0%, ${lightness}%)`;
    case 'blue':
      // Light blue → deep blue depending on intensity
      const blueLightness = Math.round(35 + intensity * 40);
      const blueSat = Math.round(60 + intensity * 30);
      return `hsl(210, ${blueSat}%, ${blueLightness}%)`;
    case 'colorful':
      // Hue shifts from bass (cyan) → mid (purple/pink) → treble (red/orange)
      // Brightness increases with intensity
      const hue = (index / total) * 260 + 180;
      const colLightness = Math.round(35 + intensity * 35);
      return `hsl(${hue}, 90%, ${colLightness}%)`;
    default:
      return '#2f95dc';
  }
}

function getBandColor(
  scheme: ColorScheme,
  band: 'bass' | 'mid' | 'treble',
  intensity: number
): string {
  const bandIndex = band === 'bass' ? 0 : band === 'mid' ? 10 : 19;
  return getBarColor(scheme, bandIndex, NUM_BARS, intensity);
}

const COLOR_SCHEME_LABELS: Record<ColorScheme, string> = {
  black: '⚫ Dark',
  blue: '🔵 Blue',
  colorful: '🌈 Color',
};
const COLOR_SCHEME_KEYS: ColorScheme[] = ['black', 'blue', 'colorful'];

// ─── Band helper ───────────────────────────────────────────────────────────
function getBand(index: number, total: number): 'bass' | 'mid' | 'treble' {
  const third = total / 3;
  if (index < third) return 'bass';
  if (index < third * 2) return 'mid';
  return 'treble';
}

// ─── Waveform shape generator ──────────────────────────────────────────────
function generateWaveformShape(count: number): number[] {
  const result: number[] = [];
  let prev = 0.5;
  for (let i = 0; i < count; i++) {
    const delta = (Math.random() - 0.5) * 0.3;
    prev = Math.max(0.08, Math.min(1, prev + delta));
    const val = Math.random() > 0.85 ? Math.min(1, prev * 1.8) : prev;
    result.push(val);
  }
  return result;
}

// ─── Bar heights hook ──────────────────────────────────────────────────────
function useBarHeights() {
  const b0 = useSharedValue(10);
  const b1 = useSharedValue(10);
  const b2 = useSharedValue(10);
  const b3 = useSharedValue(10);
  const b4 = useSharedValue(10);
  const b5 = useSharedValue(10);
  const b6 = useSharedValue(10);
  const b7 = useSharedValue(10);
  const b8 = useSharedValue(10);
  const b9 = useSharedValue(10);
  const b10 = useSharedValue(10);
  const b11 = useSharedValue(10);
  const b12 = useSharedValue(10);
  const b13 = useSharedValue(10);
  const b14 = useSharedValue(10);
  const b15 = useSharedValue(10);
  const b16 = useSharedValue(10);
  const b17 = useSharedValue(10);
  const b18 = useSharedValue(10);
  const b19 = useSharedValue(10);
  return [b0, b1, b2, b3, b4, b5, b6, b7, b8, b9, b10, b11, b12, b13, b14, b15, b16, b17, b18, b19];
}

// ─── Animated Bar (Bars mode) ──────────────────────────────────────────────
function Bar({
  height,
  index,
  scheme,
  maxHeight,
}: {
  height: SharedValue<number>;
  index: number;
  scheme: ColorScheme;
  maxHeight: number;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const intensity = Math.min(1, height.value / maxHeight);
    return {
      height: height.value,
      backgroundColor: getBarColor(scheme, index, NUM_BARS, intensity),
    };
  });
  return <Animated.View style={[styles.bar, animatedStyle]} />;
}

// ─── Waveform Display ──────────────────────────────────────────────────────
// Bars are static (never re-render). Only the Animated playhead moves.
function WaveformDisplay({
  waveShape,
  progress,
  scheme,
}: {
  waveShape: number[];
  progress: number;
  scheme: ColorScheme;
  isPlaying: boolean;
}) {
  const WAVEFORM_HEIGHT = 120;
  const BAR_WIDTH = 6;
  const GAP = 5;
  const totalWidth = waveShape.length * (BAR_WIDTH + GAP);

  // Animated playhead position — only this moves, bars stay static
  const playheadX = useSharedValue(0);
  playheadX.value = withTiming(progress * totalWidth, { duration: 120, easing: Easing.linear });

  const playheadStyle = useAnimatedStyle(() => ({
    position: 'absolute' as const,
    left: playheadX.value - 1,
    top: -8,
    width: 2,
    height: WAVEFORM_HEIGHT + 16,
    backgroundColor: '#fff',
    borderRadius: 1,
    opacity: 0.9,
  }));

  return (
    <View style={[styles.waveformWrapper, { width: totalWidth }]}>
      {waveShape.map((amp, i) => {
        const barH = Math.max(4, amp * WAVEFORM_HEIGHT);
        const fraction = i / waveShape.length;
        // Color is fixed at render time — no re-render needed
        let barColor: string;
        if (scheme === 'black') {
          barColor = `hsl(0, 0%, ${Math.round(30 + amp * 50)}%)`;
        } else if (scheme === 'blue') {
          barColor = `hsl(210, 80%, ${Math.round(35 + amp * 35)}%)`;
        } else {
          const hue = Math.round(220 - amp * 220);
          const lightness = Math.round(45 + amp * 20);
          barColor = `hsl(${hue}, 85%, ${lightness}%)`;
        }
        return (
          <View
            key={i}
            style={{
              width: BAR_WIDTH,
              height: barH,
              borderRadius: 2,
              backgroundColor: barColor,
              marginRight: GAP,
              alignSelf: 'center',
              opacity: fraction <= progress ? 1 : 0.3,
            }}
          />
        );
      })}
      {/* Animated playhead — runs on UI thread, no lag */}
      <Animated.View style={playheadStyle} />
    </View>
  );
}

// ─── Circular Bar ──────────────────────────────────────────────────────────
function CircularBar({
  height,
  index,
  total,
  scheme,
}: {
  height: SharedValue<number>;
  index: number;
  total: number;
  scheme: ColorScheme;
}) {
  const angle = (index / total) * 2 * Math.PI;
  const RADIUS = 72;
  const cx = 110 + RADIUS * Math.cos(angle - Math.PI / 2);
  const cy = 110 + RADIUS * Math.sin(angle - Math.PI / 2);

  const animatedStyle = useAnimatedStyle(() => {
    const intensity = Math.min(1, height.value / 150);
    const len = height.value * 0.45 + 8;
    return {
      position: 'absolute' as const,
      width: 6,
      height: len,
      borderRadius: 3,
      backgroundColor: getBarColor(scheme, index, total, intensity),
      left: cx - 3,
      top: cy - len,
      transform: [{ rotate: `${(angle * 180) / Math.PI}deg` }],
      transformOrigin: `3px ${len}px`,
    };
  });

  return <Animated.View style={animatedStyle} />;
}

// ─── Main Screen ───────────────────────────────────────────────────────────
export default function VisualizerScreen() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [speedIndex, setSpeedIndex] = useState(2);
  const [volume, setVolume] = useState(1);
  const [visMode, setVisMode] = useState<VisMode>('bars');
  const [colorScheme, setColorScheme] = useState<ColorScheme>('colorful');
  const [waveShape] = useState<number[]>(() => generateWaveformShape(WAVEFORM_BARS));
  const [waveKey, setWaveKey] = useState(0);
  const [waveShapes, setWaveShapes] = useState<number[][]>([generateWaveformShape(WAVEFORM_BARS)]);

  const player = useAudioPlayer(null, { updateInterval: 100 });
  const status = useAudioPlayerStatus(player);
  const barHeights = useBarHeights();
  const isPlaying = status.playing;

  const currentTime = isSeeking ? seekValue : status.currentTime;
  const progress = status.duration > 0 ? currentTime / status.duration : 0;

  const animateBars = useCallback(() => {
    barHeights.forEach((bar, i) => {
      const band = getBand(i, NUM_BARS);
      const maxH = band === 'bass' ? 150 : band === 'mid' ? 120 : 80;
      const minDur = band === 'bass' ? 280 : band === 'mid' ? 180 : 90;
      const randomHeight = Math.random() * maxH + 20;
      const randomDuration = Math.random() * 200 + minDur;
      bar.value = withRepeat(
        withSequence(
          withTiming(randomHeight, { duration: randomDuration, easing: Easing.inOut(Easing.ease) }),
          withTiming(Math.random() * 40 + 10, { duration: randomDuration, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    });
  }, [barHeights]);

  const stopBars = useCallback(() => {
    barHeights.forEach((bar) => {
      bar.value = withTiming(10, { duration: 400 });
    });
  }, [barHeights]);

  const pickAudio = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets[0];
      setFileName(file.name);
      player.replace({ uri: file.uri });
      setSpeedIndex(2);
      player.playbackRate = 1;
      setWaveShapes([generateWaveformShape(WAVEFORM_BARS)]);
      setWaveKey(k => k + 1);
    } catch (error) {
      console.error('Error picking audio:', error);
    }
  };

  const togglePlayPause = () => {
    if (isPlaying) {
      player.pause();
      stopBars();
    } else {
      if (status.currentTime >= status.duration && status.duration > 0) player.seekTo(0);
      player.play();
      animateBars();
    }
  };

  const onSeekStart = () => { setIsSeeking(true); setSeekValue(status.currentTime); };
  const onSeekComplete = (value: number) => { player.seekTo(value); setIsSeeking(false); };
  const cycleSpeed = () => {
    const nextIndex = (speedIndex + 1) % PLAYBACK_SPEEDS.length;
    setSpeedIndex(nextIndex);
    player.playbackRate = PLAYBACK_SPEEDS[nextIndex];
  };
  const onVolumeChange = (value: number) => { setVolume(value); player.volume = value; };
  const cycleColorScheme = () => {
    const idx = COLOR_SCHEME_KEYS.indexOf(colorScheme);
    setColorScheme(COLOR_SCHEME_KEYS[(idx + 1) % COLOR_SCHEME_KEYS.length]);
  };

  const formatTime = (seconds: number) => {
    if (!seconds || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const currentWaveShape = waveShapes[0] ?? generateWaveformShape(WAVEFORM_BARS);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Audio Visualizer</Text>

      {/* ── Frequency band labels ── */}
      <View style={styles.bandLabels}>
        <Text style={[styles.bandLabel, { color: getBandColor(colorScheme, 'bass', 0.8) }]}>BASS</Text>
        <Text style={[styles.bandLabel, { color: getBandColor(colorScheme, 'mid', 0.8) }]}>MID</Text>
        <Text style={[styles.bandLabel, { color: getBandColor(colorScheme, 'treble', 0.8) }]}>TREBLE</Text>
      </View>

      {/* ── Visualizer area ── */}
      {visMode === 'bars' && (
        <View style={styles.visualizerContainer}>
          {barHeights.map((height, index) => (
            <Bar key={index} height={height} index={index} scheme={colorScheme} maxHeight={150} />
          ))}
        </View>
      )}

      {visMode === 'waveform' && (
        <View style={styles.waveformContainer}>
          <WaveformDisplay
            key={waveKey}
            waveShape={currentWaveShape}
            progress={progress}
            scheme={colorScheme}
            isPlaying={isPlaying}
          />
        </View>
      )}

      {visMode === 'circular' && (
        <RNView style={styles.circularContainer}>
          {barHeights.map((height, index) => (
            <CircularBar
              key={index}
              height={height}
              index={index}
              total={NUM_BARS}
              scheme={colorScheme}
            />
          ))}
          {/* Center dot */}
          <RNView
            style={[
              styles.circularCenter,
              { backgroundColor: getBandColor(colorScheme, 'mid', 0.9) },
            ]}
          />
        </RNView>
      )}

      {/* ── Mode buttons — centered below visualizer ── */}
      <View style={styles.modeSwitchRow}>
        {(['bars', 'waveform', 'circular'] as VisMode[]).map((mode) => (
          <Pressable
            key={mode}
            style={[styles.modeButton, visMode === mode && styles.modeButtonActive]}
            onPress={() => setVisMode(mode)}
          >
            <Text style={[styles.modeButtonText, visMode === mode && styles.modeButtonTextActive]}>
              {mode === 'bars' ? '▮▮▮ Bars' : mode === 'waveform' ? '〜 Wave' : '◎ Circle'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── Color button — centered below mode buttons ── */}
      <View style={styles.colorRow}>
        <Pressable style={styles.colorButton} onPress={cycleColorScheme}>
          <Text style={styles.colorButtonText}>{COLOR_SCHEME_LABELS[colorScheme]}</Text>
        </Pressable>
      </View>

      {/* ── Track info & controls ── */}
      {fileName ? (
        <>
          <View style={styles.trackInfo}>
            <Text style={styles.fileName} numberOfLines={1}>{fileName}</Text>
          </View>

          <View style={styles.seekContainer}>
            <Text style={styles.time}>{formatTime(currentTime)}</Text>
            <Slider
              style={styles.seekBar}
              minimumValue={0}
              maximumValue={status.duration > 0 ? status.duration : 1}
              value={currentTime}
              onSlidingStart={onSeekStart}
              onValueChange={(v) => setSeekValue(v)}
              onSlidingComplete={onSeekComplete}
              minimumTrackTintColor="#2f95dc"
              maximumTrackTintColor="#555"
              thumbTintColor="#2f95dc"
            />
            <Text style={styles.time}>{formatTime(status.duration)}</Text>
          </View>

          <View style={styles.controls}>
            <Pressable style={styles.controlButton} onPress={cycleSpeed}>
              <Text style={styles.controlButtonText}>{PLAYBACK_SPEEDS[speedIndex]}x</Text>
            </Pressable>
            <Pressable style={styles.playButton} onPress={togglePlayPause}>
              <Text style={styles.playButtonText}>{isPlaying ? '⏸' : '▶'}</Text>
            </Pressable>
            <Pressable style={styles.controlButton} onPress={() => onVolumeChange(volume > 0 ? 0 : 1)}>
              <Text style={styles.controlButtonText}>
                {volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.volumeContainer}>
            <Text style={styles.volumeLabel}>Volume</Text>
            <Slider
              style={styles.volumeBar}
              minimumValue={0}
              maximumValue={1}
              value={volume}
              onValueChange={onVolumeChange}
              minimumTrackTintColor="#2f95dc"
              maximumTrackTintColor="#555"
              thumbTintColor="#2f95dc"
            />
          </View>
        </>
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Pick an audio file to start</Text>
        </View>
      )}

      <Pressable style={styles.pickButton} onPress={pickAudio}>
        <Text style={styles.pickButtonText}>{fileName ? 'Change Audio File' : 'Pick Audio File'}</Text>
      </Pressable>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 14 },

  // Mode buttons row — centered below visualizer
  modeSwitchRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
    backgroundColor: 'transparent',
  },
  modeButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#2f95dc',
    backgroundColor: 'transparent',
  },
  modeButtonActive: { backgroundColor: '#2f95dc' },
  modeButtonText: { fontSize: 13, fontWeight: '700', color: '#2f95dc' },
  modeButtonTextActive: { color: '#fff' },

  // Color button row — centered below mode buttons
  colorRow: {
    alignItems: 'center',
    marginBottom: 14,
    backgroundColor: 'transparent',
  },
  colorButton: {
    paddingHorizontal: 20,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#888',
    backgroundColor: 'transparent',
  },
  colorButtonText: { fontSize: 13, fontWeight: '600' },

  // Band labels
  bandLabels: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '80%',
    marginBottom: 6,
    backgroundColor: 'transparent',
  },
  bandLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },

  // Bars mode
  visualizerContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    height: 160,
    gap: 4,
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  bar: { width: 12, borderRadius: 6, minHeight: 10 },

  // Waveform mode
  waveformContainer: {
    height: 160,
    marginBottom: 16,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    width: '100%',
    backgroundColor: 'transparent',
  },
  waveformWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    height: 136,
  },
  playhead: {
    position: 'absolute',
    top: -8,
    width: 2,
    backgroundColor: '#fff',
    borderRadius: 1,
    opacity: 0.9,
  },

  // Circular mode
  circularContainer: {
    width: 220,
    height: 220,
    marginBottom: 16,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circularCenter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    position: 'absolute',
    top: 100,
    left: 100,
    opacity: 0.9,
  },

  // Track info
  trackInfo: { alignItems: 'center', marginBottom: 8, backgroundColor: 'transparent' },
  fileName: { fontSize: 14, opacity: 0.8, maxWidth: 280 },

  seekContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  seekBar: { flex: 1, height: 40, marginHorizontal: 8 },
  time: {
    fontSize: 13,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    minWidth: 40,
    textAlign: 'center',
  },

  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginBottom: 16,
    backgroundColor: 'transparent',
  },
  playButton: {
    backgroundColor: '#2f95dc',
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButtonText: { fontSize: 22, color: '#fff' },
  controlButton: {
    backgroundColor: 'rgba(47, 149, 220, 0.15)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 48,
    alignItems: 'center',
  },
  controlButtonText: { fontSize: 16, fontWeight: '600', color: '#2f95dc' },

  volumeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '80%',
    marginBottom: 20,
    backgroundColor: 'transparent',
  },
  volumeLabel: { fontSize: 13, opacity: 0.6, marginRight: 8 },
  volumeBar: { flex: 1, height: 32 },

  placeholder: { marginBottom: 20, backgroundColor: 'transparent' },
  placeholderText: { fontSize: 16, opacity: 0.5 },

  pickButton: { backgroundColor: '#2f95dc', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  pickButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
