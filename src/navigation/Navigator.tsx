import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {Colors, radius, spacing, useThemedStyles} from '../theme';

/**
 * A stack of named screens, deliberately hand-rolled.
 *
 * The app has four destinations and no deep links, so React Navigation would
 * add three native dependencies to solve a problem this size. What is needed
 * is a push/pop stack, a slide transition and the Android back button, which
 * is what this provides.
 */
export type Route<T> = {name: T; params?: Record<string, unknown>};

type NavValue<T extends string> = {
  push: (name: T, params?: Record<string, unknown>) => void;
  pop: () => void;
  reset: (name: T) => void;
  current: Route<T>;
  depth: number;
};

const NavContext = createContext<NavValue<string> | null>(null);

export function useNavigation<T extends string = string>(): NavValue<T> {
  const value = useContext(NavContext);
  if (!value) {
    throw new Error('useNavigation must be used inside a Navigator');
  }
  // The context is stored with its names widened to `string`; each caller
  // narrows it back to its own route union.
  return value as unknown as NavValue<T>;
}

/** Params for the screen being rendered, typed by the caller. */
export function useRouteParams<P extends Record<string, unknown>>(): P {
  return (useNavigation().current.params ?? {}) as P;
}

type Props<T extends string> = {
  initial: T;
  /** Renders the body of a given route. */
  render: (route: Route<T>) => React.ReactNode;
  /** Title shown in the header; the root screen draws its own. */
  title: (route: Route<T>) => string;
};

export function Navigator<T extends string>({initial, render, title}: Props<T>) {
  const styles = useThemedStyles(makeStyles);
  const [stack, setStack] = useState<Array<Route<T>>>([{name: initial}]);
  const slide = useRef(new Animated.Value(0)).current;

  const current = stack[stack.length - 1];
  const depth = stack.length;

  const animateIn = useCallback(() => {
    slide.setValue(1);
    Animated.timing(slide, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [slide]);

  const push = useCallback(
    (name: T, params?: Record<string, unknown>) => {
      setStack(previous => [...previous, {name, params}]);
      animateIn();
    },
    [animateIn],
  );

  const pop = useCallback(() => {
    setStack(previous =>
      previous.length > 1 ? previous.slice(0, -1) : previous,
    );
    animateIn();
  }, [animateIn]);

  const reset = useCallback(
    (name: T) => {
      setStack([{name}]);
      animateIn();
    },
    [animateIn],
  );

  // The hardware back button pops the stack; on the root screen it falls
  // through to the system so the app can be backgrounded as usual.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length > 1) {
        pop();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length, pop]);

  const value = useMemo<NavValue<string>>(
    () => ({
      push: push as NavValue<string>['push'],
      pop,
      reset: reset as NavValue<string>['reset'],
      current: current as Route<string>,
      depth,
    }),
    [push, pop, reset, current, depth],
  );

  const translateX = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 60],
  });

  return (
    <NavContext.Provider value={value}>
      <View style={styles.root}>
        {depth > 1 ? (
          <View style={styles.header}>
            <Pressable onPress={pop} hitSlop={12} style={styles.back}>
              <Text style={styles.backText}>‹</Text>
            </Pressable>
            <Text style={styles.title} numberOfLines={1}>
              {title(current)}
            </Text>
          </View>
        ) : null}
        <Animated.View
          style={[styles.body, {opacity: slide.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0],
          }), transform: [{translateX}]}]}>
          {render(current)}
        </Animated.View>
      </View>
    </NavContext.Provider>
  );
}

const makeStyles = (c: Colors) =>
  ({
    root: {flex: 1, backgroundColor: 'transparent'},
    body: {flex: 1},
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    back: {
      width: 34,
      height: 34,
      borderRadius: radius.pill,
      backgroundColor: c.surfaceAlt,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.md,
    },
    backText: {
      color: c.text,
      fontSize: 26,
      lineHeight: 30,
      fontWeight: '700',
      marginTop: -3,
    },
    title: {flex: 1, color: c.text, fontSize: 18, fontWeight: '700'},
  }) as const;
