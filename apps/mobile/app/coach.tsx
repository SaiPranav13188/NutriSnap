import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { api, ApiError } from '../src/lib/api';
import { Card, ErrorNote, Screen } from '../src/components/ui';
import { useColors } from '../src/lib/theme';

/**
 * Ask questions about your own logged data.
 *
 * Not a general chatbot: the server assembles a factual summary of the asker's
 * own rows and the model is instructed to answer from that alone. The point is
 * a question like "why has my weight stalled?" being answerable at all, which
 * needs the history rather than general nutrition advice.
 *
 * Conversation is deliberately not persisted. Each question is answered
 * against a freshly built summary, so an answer can never be based on a
 * stale picture of the day.
 */

interface Turn {
  question: string;
  answer: string | null;
  failed?: boolean;
}

export default function Coach() {
  const c = useColors();
  const scrollRef = useRef<ScrollView>(null);

  const [prompts, setPrompts] = useState<string[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getCoachPrompts()
      .then(({ prompts: list }) => setPrompts(list))
      .catch(() => {
        // Suggestions are a convenience; the input works without them.
      });
  }, []);

  const ask = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || asking) return;

      setError(null);
      setQuestion('');
      setAsking(true);
      setTurns((prev) => [...prev, { question: trimmed, answer: null }]);
      void Haptics.selectionAsync();

      try {
        const { answer } = await api.askCoach(trimmed);
        setTurns((prev) =>
          prev.map((turn, i) => (i === prev.length - 1 ? { ...turn, answer } : turn)),
        );
      } catch (caught) {
        const message =
          caught instanceof ApiError ? caught.message : 'The coach could not answer that.';
        setError(message);
        setTurns((prev) =>
          prev.map((turn, i) =>
            i === prev.length - 1 ? { ...turn, answer: message, failed: true } : turn,
          ),
        );
      } finally {
        setAsking(false);
      }
    },
    [asking],
  );

  return (
    <Screen>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 8,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={10}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: c.glass.border,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: c.text.primary, fontSize: 18, lineHeight: 20 }}>‹</Text>
          </Pressable>

          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text.primary, fontSize: 22, fontWeight: '700' }}>Coach</Text>
            <Text style={{ color: c.text.tertiary, fontSize: 12 }}>
              Answers from your own logs
            </Text>
          </View>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={8}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {error && <ErrorNote message={error} />}

            {turns.length === 0 && (
              <Card style={{ padding: 20, gap: 12 }}>
                <Text style={{ color: c.text.primary, fontSize: 16, fontWeight: '600' }}>
                  Ask about your week
                </Text>
                <Text style={{ color: c.text.secondary, fontSize: 14, lineHeight: 20 }}>
                  The coach reads the last fortnight of your meals, weigh-ins, workouts and
                  water, and answers from those numbers. It will say so when it does not have
                  enough to go on.
                </Text>
              </Card>
            )}

            {turns.map((turn, i) => (
              <Animated.View key={i} entering={FadeInDown.duration(220)} style={{ gap: 10 }}>
                <View style={{ alignSelf: 'flex-end', maxWidth: '88%' }}>
                  <View
                    style={{
                      backgroundColor: c.accent.lime,
                      borderRadius: 18,
                      borderBottomRightRadius: 6,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                    }}
                  >
                    <Text style={{ color: c.base['900'], fontSize: 15, lineHeight: 21 }}>
                      {turn.question}
                    </Text>
                  </View>
                </View>

                <View style={{ alignSelf: 'flex-start', maxWidth: '92%' }}>
                  <View
                    style={{
                      backgroundColor: c.glass.DEFAULT,
                      borderRadius: 18,
                      borderBottomLeftRadius: 6,
                      paddingHorizontal: 14,
                      paddingVertical: 12,
                      borderWidth: 1,
                      borderColor: turn.failed ? `${c.state.danger}55` : c.glass.border,
                    }}
                  >
                    {turn.answer === null ? (
                      <ActivityIndicator color={c.accent.lime} />
                    ) : (
                      <Text
                        style={{
                          color: turn.failed ? c.state.danger : c.text.primary,
                          fontSize: 15,
                          lineHeight: 22,
                        }}
                      >
                        {turn.answer}
                      </Text>
                    )}
                  </View>
                </View>
              </Animated.View>
            ))}

            {prompts.length > 0 && !asking && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                {prompts.map((prompt) => (
                  <Pressable
                    key={prompt}
                    onPress={() => void ask(prompt)}
                    accessibilityRole="button"
                    style={{
                      paddingHorizontal: 13,
                      paddingVertical: 9,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: c.glass.border,
                    }}
                  >
                    <Text style={{ color: c.text.secondary, fontSize: 13 }}>{prompt}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>

          <View
            style={{
              flexDirection: 'row',
              gap: 10,
              paddingHorizontal: 20,
              paddingBottom: 16,
              paddingTop: 4,
            }}
          >
            <TextInput
              value={question}
              onChangeText={setQuestion}
              placeholder="Ask about your logs…"
              placeholderTextColor={c.text.tertiary}
              maxLength={500}
              onSubmitEditing={() => void ask(question)}
              returnKeyType="send"
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: 24,
                borderWidth: 1,
                borderColor: c.glass.border,
                backgroundColor: c.glass.DEFAULT,
                color: c.text.primary,
                fontSize: 15,
                paddingHorizontal: 18,
              }}
            />

            <Pressable
              onPress={() => void ask(question)}
              disabled={asking || question.trim().length === 0}
              accessibilityRole="button"
              accessibilityLabel="Send question"
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: c.accent.lime,
                opacity: asking || question.trim().length === 0 ? 0.4 : 1,
              }}
            >
              <Text style={{ color: c.base['900'], fontSize: 18, fontWeight: '700' }}>↑</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Screen>
  );
}
