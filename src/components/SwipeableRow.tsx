import React, { useRef } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { colors } from '../theme/colors';

export interface SwipeAction {
  icon: React.ReactNode;
  color: string;
  onTrigger: () => void;
}

interface SwipeableRowProps {
  // Revealed, pinned to the left edge, when dragging the row to the right.
  leftAction?: SwipeAction;
  // Revealed, pinned to the right edge, when dragging the row to the left.
  rightAction?: SwipeAction;
  children: React.ReactNode;
}

// Mirrors real Tachiyomi's chapter row swipe (me.saket.swipe SwipeableActionsBox): a single
// icon pinned to the edge being dragged from, dimmed until the drag crosses the threshold.
const MAX_REVEAL = 96;
const SWIPE_THRESHOLD = 64;

// Plain PanResponder rather than react-native-gesture-handler — this codebase already dropped
// gesture-handler once (it fought with the reader's native SubsamplingScaleImageView touch
// handling), and a chapter row has no competing native gesture owner, so there's no need to
// bring the dependency back just for this.
export function SwipeableRow({ leftAction, rightAction, children }: SwipeableRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderMove: (_, gesture) => {
        let dx = gesture.dx;
        if (dx > 0 && !leftAction) dx = 0;
        if (dx < 0 && !rightAction) dx = 0;
        translateX.setValue(Math.max(-MAX_REVEAL, Math.min(MAX_REVEAL, dx)));
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD && leftAction) {
          leftAction.onTrigger();
        } else if (gesture.dx < -SWIPE_THRESHOLD && rightAction) {
          rightAction.onTrigger();
        }
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      },
    }),
  ).current;

  const leftBg = translateX.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [colors.surface, leftAction?.color ?? colors.surface],
    extrapolate: 'clamp',
  });
  const rightBg = translateX.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [rightAction?.color ?? colors.surface, colors.surface],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      {leftAction && (
        <Animated.View style={[styles.side, styles.leftSide, { backgroundColor: leftBg }]}>
          {leftAction.icon}
        </Animated.View>
      )}
      {rightAction && (
        <Animated.View style={[styles.side, styles.rightSide, { backgroundColor: rightBg }]}>
          {rightAction.icon}
        </Animated.View>
      )}
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 12, overflow: 'hidden' },
  side: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: MAX_REVEAL,
    justifyContent: 'center',
    alignItems: 'center',
  },
  leftSide: { left: 0 },
  rightSide: { right: 0 },
});
