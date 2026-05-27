import React, { useEffect, useMemo, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileText,
  Filter,
  Loader2,
  Lock,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Trash2,
  Trophy,
  UploadCloud,
  WandSparkles,
  XCircle,
  MoreHorizontal,
} from 'lucide-react';
import { UserData } from '../types';
import { supabase } from '../utils/supabase';
import { playClick } from '../utils/audio';
import { apiUrl } from '../utils/api';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface ExamStudyAIProps {
  data: UserData;
  userId?: string;
}

interface CourseOption {
  subject_name: string;
  course_code?: string;
}

interface PracticeQuestion {
  id?: string;
  question: string;
  options: string[];
  correct_answer: string;
  explanation?: string;
  topic_tag?: string;
  position?: number;
}

interface PracticeSetRow {
  id: string;
  owner_id?: string | null;
  source_type?: 'admin' | 'ai';
  subject_name: string;
  course_code?: string | null;
  chapter_title?: string | null;
  chapter_code?: string | null;
  title: string;
  description?: string | null;
  difficulty?: string;
  visibility?: string;
  storage_provider?: string;
  content_url?: string | null;
  content_key?: string | null;
  question_count?: number;
  estimated_minutes?: number | null;
  created_at?: string;
}

interface ActivePracticeSet extends PracticeSetRow {
  questions: PracticeQuestion[];
}

type AnswerMode = 'instant' | 'after_submit';

type ImportRow = {
  id: string;
  subjectName: string;
  subjectMode: 'existing' | 'new';
  title: string;
  visibility: string;
  importing?: boolean;
};

type EditableQuestion = {
  id: string;
  question: string;
  options: Record<string, string>;
  correctAnswer: string;
  explanation: string;
  topicTag?: string;
};

type ContentEditorDraft = {
  setId: string;
  loading?: boolean;
  saving?: boolean;
  questions: EditableQuestion[];
};

type AttemptSummary = {
  set_id: string;
  total_questions: number;
  correct_count: number;
  submitted_at?: string;
};

type WrongReviewAnswer = {
  selected_answer?: string | null;
  correct_answer: string;
};

const createImportRow = (): ImportRow => ({
  id: crypto.randomUUID(),
  subjectName: '',
  subjectMode: 'existing',
  title: '',
  visibility: 'public',
});

const normalizeCourseKey = (course: CourseOption) => `${course.subject_name}__${course.course_code || ''}`;

const difficultyLabel = (value?: string) => {
  if (value === 'easy') return 'Cơ bản';
  if (value === 'hard') return 'Nâng cao';
  return 'Vừa sức';
};

const visibilityLabel = (value?: string) => {
  if (value === 'pro') return 'Pro';
  if (value === 'private') return 'Riêng tư';
  return 'Miễn phí';
};

const normalizeQuizQuestions = (questions: any[] = []): PracticeQuestion[] => {
  return questions.map((item, index) => {
    const rawOptions = item.options || [];
    const optionEntries = Array.isArray(rawOptions)
      ? rawOptions.map((value: string, optionIndex: number) => [String(optionIndex), String(value)])
      : Object.entries(rawOptions).map(([key, value]) => [key, String(value)]);

    const options = Array.isArray(rawOptions)
      ? optionEntries.map(([, value]) => value)
      : optionEntries.map(([key, value]) => `${key}. ${value}`);

    const rawCorrect = String(item.correct_answer || item.correctAnswer || '');
    const correctEntry = optionEntries.find(([key, value]) => key === rawCorrect || value === rawCorrect);
    const correctAnswer = Array.isArray(rawOptions)
      ? rawCorrect
      : correctEntry
        ? `${correctEntry[0]}. ${correctEntry[1]}`
        : rawCorrect;

    return {
      id: item.id || `q${index + 1}`,
      question: String(item.question || ''),
      options,
      correct_answer: correctAnswer,
      explanation: item.explanation || '',
      topic_tag: item.topic_tag || item.topicTag || item.chapter || '',
      position: index,
    };
  }).filter((item) => item.question && item.options.length && item.correct_answer);
};

const formatTime = (seconds: number) => {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remain = safe % 60;
  return `${minutes}:${String(remain).padStart(2, '0')}`;
};

const formatScore10 = (correct?: number, total?: number) => {
  if (!total) return '-';
  const value = Math.max(0, Math.min(10, ((correct || 0) / total) * 10));
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
};

const optionKeys = ['A', 'B', 'C', 'D'];

const normalizeEditableQuestions = (questions: any[] = []): EditableQuestion[] => {
  return questions.map((item, index) => {
    const rawOptions = item.options || {};
    const options = Array.isArray(rawOptions)
      ? Object.fromEntries(rawOptions.map((value: string, optionIndex: number) => [
        ['A', 'B', 'C', 'D', 'E', 'F'][optionIndex] || String(optionIndex + 1),
        String(value || ''),
      ]))
      : Object.fromEntries(Object.entries(rawOptions).map(([key, value]) => [String(key).toUpperCase().slice(0, 1), String(value || '')]));

    const keys = Object.keys(options).length ? Object.keys(options) : optionKeys;
    const correctAnswer = String(item.correctAnswer || item.correct_answer || keys[0] || 'A').toUpperCase().slice(0, 1);

    return {
      id: String(item.id || `q${index + 1}`),
      question: String(item.question || ''),
      options: Object.fromEntries(keys.map((key) => [key, options[key] || ''])),
      correctAnswer,
      explanation: String(item.explanation || ''),
      topicTag: String(item.topicTag || item.topic_tag || ''),
    };
  });
};

export const ExamStudyAI: React.FC<ExamStudyAIProps> = ({ data, userId }) => {
  const { setId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isWrongReview = new URLSearchParams(location.search).get('review') === 'wrong';

  const transcriptCourses = useMemo<CourseOption[]>(() => {
    const map = new Map<string, CourseOption>();
    data.semesters.forEach((semester) => {
      semester.subjects.forEach((subject) => {
        if (!subject.name?.trim()) return;
        const item = { subject_name: subject.name.trim(), course_code: '' };
        map.set(normalizeCourseKey(item), item);
      });
    });
    return Array.from(map.values()).slice(0, 20);
  }, [data.semesters]);

  const [courseOptions, setCourseOptions] = useState<CourseOption[]>(transcriptCourses);
  const [librarySets, setLibrarySets] = useState<PracticeSetRow[]>([]);
  const [attemptsBySet, setAttemptsBySet] = useState<Record<string, AttemptSummary>>({});
  const [subjectFilter, setSubjectFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [studyFilter, setStudyFilter] = useState<'all' | 'todo' | 'done'>('all');
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [loadingSet, setLoadingSet] = useState(false);
  const [error, setError] = useState('');
  const [activeSet, setActiveSet] = useState<ActivePracticeSet | null>(null);
  const [wrongReviewAnswers, setWrongReviewAnswers] = useState<Record<string, WrongReviewAnswer>>({});
  const [loadingWrongReview, setLoadingWrongReview] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [answerMode, setAnswerMode] = useState<AnswerMode>('after_submit');
  const [canManagePractice, setCanManagePractice] = useState(false);
  const [currentRole, setCurrentRole] = useState('');
  const [editingSets, setEditingSets] = useState<Record<string, { subject_name: string; title: string; saving?: boolean }>>({});
  const [contentEditor, setContentEditor] = useState<ContentEditorDraft | null>(null);
  const [openOptionsSetId, setOpenOptionsSetId] = useState<string | null>(null);
  const [openInfoEditorSetId, setOpenInfoEditorSetId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [importRows, setImportRows] = useState<ImportRow[]>(() => [createImportRow()]);

  useEffect(() => {
    document.title = setId ? 'Làm đề | HUB Planner' : 'Luyện đề | HUB Planner';
  }, [setId]);

  useEffect(() => {
    let cancelled = false;

    const loadRole = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const currentUserId = sessionData.session?.user?.id;
        if (!currentUserId) return;
        const { data: roleRow } = await supabase
          .from('user_roles')
          .select('role')
          .or(`id.eq.${currentUserId},user_id.eq.${currentUserId}`)
          .maybeSingle();

        const role = String(roleRow?.role || '').toLowerCase();
        if (!cancelled) {
          setCurrentRole(role);
          setCanManagePractice(['admin', 'ctv'].includes(role));
        }
      } catch {
        if (!cancelled) {
          setCurrentRole('');
          setCanManagePractice(false);
        }
      }
    };

    loadRole();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadLibrary = async () => {
    setLoadingLibrary(true);
    setError('');
    try {
      const { data: rows, error: loadError } = await supabase
        .from('practice_sets')
        .select('id, subject_name, course_code, chapter_title, chapter_code, title, description, difficulty, visibility, storage_provider, content_url, content_key, question_count, estimated_minutes, created_at')
        .in('visibility', ['public', 'pro'])
        .order('created_at', { ascending: false })
        .limit(200);

      if (loadError) throw loadError;
      setLibrarySets(rows || []);
    } catch (err: any) {
      setLibrarySets([]);
      setError(err.message || 'Không thể tải kho đề.');
    } finally {
      setLoadingLibrary(false);
    }
  };

  const loadAttemptSummary = async () => {
    const targetUserId = userId || (await supabase.auth.getSession()).data.session?.user?.id;
    if (!targetUserId) {
      setAttemptsBySet({});
      return;
    }

    try {
      const { data: rows, error: attemptError } = await supabase
        .from('practice_attempts')
        .select('set_id, total_questions, correct_count, submitted_at')
        .eq('user_id', targetUserId)
        .order('submitted_at', { ascending: false })
        .limit(500);

      if (attemptError) throw attemptError;

      const summary: Record<string, AttemptSummary> = {};
      (rows || []).forEach((row: any) => {
        const setKey = String(row.set_id || '');
        if (!setKey) return;
        const currentScore = Number(row.total_questions || 0) ? Number(row.correct_count || 0) / Number(row.total_questions || 0) : 0;
        const previous = summary[setKey];
        const previousScore = previous?.total_questions ? previous.correct_count / previous.total_questions : -1;
        if (!previous || currentScore >= previousScore) {
          summary[setKey] = {
            set_id: setKey,
            total_questions: Number(row.total_questions || 0),
            correct_count: Number(row.correct_count || 0),
            submitted_at: row.submitted_at,
          };
        }
      });
      setAttemptsBySet(summary);
    } catch {
      setAttemptsBySet({});
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadCourses = async () => {
      const merged = new Map<string, CourseOption>();
      transcriptCourses.forEach((course) => merged.set(normalizeCourseKey(course), course));

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const currentUserId = sessionData.session?.user?.id;

        if (currentUserId) {
          const { data: scheduleRows } = await supabase
            .from('user_schedules')
            .select('course_schedules(subject_name, course_code)')
            .eq('user_id', currentUserId)
            .limit(30);

          (scheduleRows || []).forEach((row: any) => {
            const course = row.course_schedules;
            if (!course?.subject_name) return;
            const item = { subject_name: course.subject_name, course_code: course.course_code || '' };
            merged.set(normalizeCourseKey(item), item);
          });
        }

        const { data: publicCourses } = await supabase
          .from('practice_sets')
          .select('subject_name, course_code')
          .in('visibility', ['public', 'pro'])
          .order('created_at', { ascending: false })
          .limit(100);

        (publicCourses || []).forEach((course: any) => {
          if (!course?.subject_name) return;
          const item = { subject_name: course.subject_name, course_code: course.course_code || '' };
          merged.set(normalizeCourseKey(item), item);
        });
      } catch {
        // Course suggestions are optional.
      }

      if (!cancelled) setCourseOptions(Array.from(merged.values()).slice(0, 100));
    };

    loadCourses();
    loadLibrary();
    loadAttemptSummary();
    return () => {
      cancelled = true;
    };
  }, [transcriptCourses, userId]);

  const uniqueSubjects = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    courseOptions.forEach((course) => {
      if (!course.subject_name) return;
      map.set(course.subject_name, { name: course.subject_name, count: 0 });
    });
    librarySets.forEach((item) => {
      if (!item.subject_name) return;
      const current = map.get(item.subject_name) || { name: item.subject_name, count: 0 };
      current.count += 1;
      map.set(item.subject_name, current);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [courseOptions, librarySets]);

  const subjectsWithSets = useMemo(() => uniqueSubjects.filter((subject) => subject.count > 0), [uniqueSubjects]);

  useEffect(() => {
    if (!subjectFilter && subjectsWithSets.length) {
      setSubjectFilter(subjectsWithSets[0].name);
    }
  }, [subjectFilter, subjectsWithSets]);

  useEffect(() => {
    if (!subjectsWithSets.length) return;
    setImportRows((rows) => rows.map((row) => (
      row.subjectName || row.subjectMode === 'new'
        ? row
        : { ...row, subjectName: subjectsWithSets[0].name }
    )));
  }, [subjectsWithSets]);

  const subjectSets = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    return librarySets.filter((item) => {
      const subjectOk = !subjectFilter || item.subject_name === subjectFilter;
      const keywordOk = !keyword || [
        item.title,
        item.description,
        item.subject_name,
        item.course_code,
        item.chapter_title,
      ].some((value) => String(value || '').toLowerCase().includes(keyword));
      return subjectOk && keywordOk;
    });
  }, [librarySets, searchQuery, subjectFilter]);

  const selectedSubject = subjectsWithSets.find((subject) => subject.name === subjectFilter);
  const totalQuestionCount = subjectSets.reduce((total, item) => total + (item.question_count || 0), 0);
  const totalEstimatedMinutes = subjectSets.reduce((total, item) => total + (item.estimated_minutes || Math.max(1, Math.ceil((item.question_count || 1) * 1.2))), 0);
  const visibleSubjectSets = subjectSets.filter((item) => {
    const hasAttempt = Boolean(attemptsBySet[item.id]);
    if (studyFilter === 'done') return hasAttempt;
    if (studyFilter === 'todo') return !hasAttempt;
    return true;
  });
  const selectedSubjectName = selectedSubject?.name || subjectFilter || 'Chưa chọn môn';
  const completedSets = subjectSets.filter((item) => attemptsBySet[item.id]).length;
  const answeredQuestions = subjectSets.reduce((total, item) => total + (attemptsBySet[item.id]?.total_questions || 0), 0);
  const bestScoreValue = subjectSets.reduce((best, item) => {
    const attempt = attemptsBySet[item.id];
    if (!attempt?.total_questions) return best;
    return Math.max(best, (attempt.correct_count / attempt.total_questions) * 10);
  }, -1);
  const bestScoreLabel = bestScoreValue >= 0 ? (Number.isInteger(bestScoreValue) ? bestScoreValue.toFixed(0) : bestScoreValue.toFixed(1)) : '-';
  const completionPercent = subjectSets.length ? Math.round((completedSets / subjectSets.length) * 100) : 0;

  const score = useMemo(() => {
    const questions = activeSet?.questions || [];
    const correct = questions.reduce((total, question, index) => total + (answers[index] === question.correct_answer ? 1 : 0), 0);
    return { correct, total: questions.length };
  }, [activeSet, answers]);

  const allAnswered = Boolean(activeSet?.questions?.length && Object.keys(answers).length >= activeSet.questions.length);
  const displayedQuizQuestions = (activeSet?.questions || [])
    .map((question, index) => ({ question, index, key: question.id || `q${index + 1}` }))
    .filter((entry) => !isWrongReview || Boolean(wrongReviewAnswers[entry.key]));

  const handleStudySuggestion = (action: 'chapter' | 'comprehensive' | 'mistakes') => {
    playClick();
    setError('');

    if (action === 'chapter') {
      setSearchQuery('');
      setStudyFilter('todo');
      return;
    }

    if (action === 'comprehensive') {
      const comprehensiveSet = subjectSets.find((item) => {
        const text = `${item.title} ${item.description || ''}`.toLowerCase();
        return ['tổng hợp', 'tong hop', 'giữa kỳ', 'giua ky', 'cuối kỳ', 'cuoi ky', 'midterm', 'final'].some((keyword) => text.includes(keyword));
      });

      if (comprehensiveSet) {
        navigate('/exam-ai/' + comprehensiveSet.id);
        return;
      }

      setStudyFilter('all');
      setSearchQuery('tổng hợp');
      setError('Chưa có đề tổng hợp cho môn này. Bạn có thể thêm bộ đề tổng hợp từ khu upload PDF.');
      return;
    }

    const attemptedSets = subjectSets
      .map((item) => ({ item, attempt: attemptsBySet[item.id] }))
      .filter((entry): entry is { item: PracticeSetRow; attempt: AttemptSummary } => Boolean(entry.attempt?.total_questions))
      .sort((a, b) => (a.attempt.correct_count / a.attempt.total_questions) - (b.attempt.correct_count / b.attempt.total_questions));

    if (attemptedSets[0]) {
      navigate('/exam-ai/' + attemptedSets[0].item.id + '?review=wrong');
      return;
    }

    setStudyFilter('done');
    setError('Chưa có lịch sử làm bài để xem lại câu sai.');
  };

  const resetAttempt = () => {
    setAnswers({});
    setSubmitted(false);
    const minutes = activeSet?.estimated_minutes || Math.max(1, Math.ceil((activeSet?.questions?.length || 1) * 1.2));
    setTimeLeft(minutes * 60);
    setStartedAt(Date.now());
  };

  const loadPracticeSet = async (id: string) => {
    setError('');
    setLoadingSet(true);
    try {
      const { data: setRow, error: setError } = await supabase
        .from('practice_sets')
        .select('id, owner_id, source_type, subject_name, course_code, chapter_title, chapter_code, title, description, difficulty, visibility, storage_provider, content_url, content_key, question_count, estimated_minutes')
        .eq('id', id)
        .single();
      if (setError) throw setError;

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const contentResponse = await fetch(`${apiUrl('/practice-content')}?id=${encodeURIComponent(id)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: 'no-store',
      });
      const content = await contentResponse.json().catch(() => null);
      if (!contentResponse.ok) throw new Error(content?.error || 'Không thể tải nội dung đề.');

      const questions = normalizeQuizQuestions(content.questions || []);
      if (!questions.length) throw new Error('Bộ đề chưa có câu hỏi.');

      const nextSet = { ...(setRow as PracticeSetRow), questions };
      setActiveSet(nextSet);
      setAnswers({});
      setSubmitted(false);
      setStartedAt(Date.now());
      setTimeLeft((nextSet.estimated_minutes || Math.max(1, Math.ceil(questions.length * 1.2))) * 60);
    } catch (err: any) {
      setActiveSet(null);
      setError(err.message || 'Không thể tải bộ đề.');
    } finally {
      setLoadingSet(false);
    }
  };

  const loadWrongReviewAnswers = async (id: string) => {
    const targetUserId = userId || (await supabase.auth.getSession()).data.session?.user?.id;
    if (!targetUserId) {
      setWrongReviewAnswers({});
      return;
    }

    setLoadingWrongReview(true);
    try {
      const { data: attempt, error: attemptError } = await supabase
        .from('practice_attempts')
        .select('id')
        .eq('user_id', targetUserId)
        .eq('set_id', id)
        .order('submitted_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (attemptError) throw attemptError;
      if (!attempt?.id) {
        setWrongReviewAnswers({});
        return;
      }

      const { data: rows, error: answerError } = await supabase
        .from('practice_attempt_answers')
        .select('question_id, selected_answer, correct_answer')
        .eq('attempt_id', attempt.id)
        .eq('is_correct', false);

      if (answerError) throw answerError;

      const mapped: Record<string, WrongReviewAnswer> = {};
      (rows || []).forEach((row: any) => {
        if (!row.question_id) return;
        mapped[String(row.question_id)] = {
          selected_answer: row.selected_answer,
          correct_answer: String(row.correct_answer || ''),
        };
      });
      setWrongReviewAnswers(mapped);
    } catch {
      setWrongReviewAnswers({});
    } finally {
      setLoadingWrongReview(false);
    }
  };

  useEffect(() => {
    if (setId) loadPracticeSet(setId);
  }, [setId]);

  useEffect(() => {
    setWrongReviewAnswers({});
    if (setId && isWrongReview) loadWrongReviewAnswers(setId);
  }, [setId, isWrongReview, userId]);

  useEffect(() => {
    if (!setId || !activeSet || isWrongReview || submitted || timeLeft <= 0) return;
    const timer = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          setSubmitted(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [activeSet, isWrongReview, setId, submitted, timeLeft]);

  const handleSubmitQuiz = async () => {
    if (!activeSet?.questions?.length) return;
    playClick();
    setSubmitted(true);

    const id = activeSet.id;
    if (!userId || !id) return;

    try {
      const weakTopics = activeSet.questions
        .filter((question, index) => answers[index] !== question.correct_answer)
        .map((question) => question.topic_tag || 'Chưa phân loại')
        .filter(Boolean);

      const { data: attempt, error: attemptError } = await supabase.from('practice_attempts').insert({
        user_id: userId,
        set_id: id,
        score: score.correct,
        total_questions: score.total,
        correct_count: score.correct,
        duration_seconds: startedAt ? Math.max(1, Math.round((Date.now() - startedAt) / 1000)) : null,
        weak_topics: Array.from(new Set(weakTopics)),
        started_at: startedAt ? new Date(startedAt).toISOString() : new Date().toISOString(),
        submitted_at: new Date().toISOString(),
      }).select('id').single();

      if (attemptError) throw attemptError;

      const answerRows = activeSet.questions.map((question, index) => ({
        attempt_id: attempt.id,
        question_id: question.id || `q${index + 1}`,
        selected_answer: answers[index] || null,
        correct_answer: question.correct_answer,
        is_correct: answers[index] === question.correct_answer,
      }));

      if (answerRows.length) await supabase.from('practice_attempt_answers').insert(answerRows);
      setAttemptsBySet((prev) => {
        const previous = prev[id];
        const previousScore = previous?.total_questions ? previous.correct_count / previous.total_questions : -1;
        const nextScore = score.total ? score.correct / score.total : 0;
        if (previous && previousScore > nextScore) return prev;
        return {
          ...prev,
          [id]: {
          set_id: id,
          total_questions: score.total,
          correct_count: score.correct,
          submitted_at: new Date().toISOString(),
          },
        };
      });
    } catch {
      // Keep the score visible even if saving the attempt fails.
    }
  };

  const extractPdfText = async (file: File) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
      const page = await pdf.getPage(pageIndex);
      const textContent = await page.getTextContent();
      fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
    }

    return fullText.replace(/\s+/g, ' ').trim();
  };

  const updateImportRow = (rowId: string, patch: Partial<ImportRow>) => {
    setImportRows((rows) => rows.map((row) => row.id === rowId ? { ...row, ...patch } : row));
  };

  const addImportRow = () => {
    playClick();
    setImportRows((rows) => [...rows, createImportRow()]);
  };

  const removeImportRow = (rowId: string) => {
    playClick();
    setImportRows((rows) => rows.length > 1 ? rows.filter((row) => row.id !== rowId) : rows);
  };

  const updateEditingSet = (set: PracticeSetRow, patch: Partial<{ subject_name: string; title: string }>) => {
    setEditingSets((prev) => ({
      ...prev,
      [set.id]: {
        subject_name: prev[set.id]?.subject_name ?? set.subject_name,
        title: prev[set.id]?.title ?? set.title,
        ...patch,
      },
    }));
  };

  const saveSetMetadata = async (set: PracticeSetRow) => {
    const draft = editingSets[set.id] || { subject_name: set.subject_name, title: set.title };
    const subjectName = draft.subject_name.trim();
    const title = draft.title.trim();
    if (!subjectName || !title) {
      setError('Tên môn và tên bộ đề không được để trống.');
      return;
    }

    playClick();
    setEditingSets((prev) => ({ ...prev, [set.id]: { ...draft, saving: true } }));
    setError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Bạn cần đăng nhập để cập nhật bộ đề.');

      const response = await fetch(apiUrl('/practice-import'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'update-metadata',
          setId: set.id,
          subjectName,
          title,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Không thể cập nhật bộ đề.');

      setLibrarySets((rows) => rows.map((row) => row.id === set.id ? { ...row, subject_name: subjectName, title, chapter_title: null } : row));
      setEditingSets((prev) => {
        const next = { ...prev };
        delete next[set.id];
        return next;
      });
      if (subjectFilter === set.subject_name && subjectName !== set.subject_name) setSubjectFilter(subjectName);
    } catch (err: any) {
      setError(err.message || 'Không thể cập nhật bộ đề.');
      setEditingSets((prev) => ({ ...prev, [set.id]: { ...draft, saving: false } }));
    }
  };

  const loadContentEditor = async (set: PracticeSetRow) => {
    playClick();
    setError('');
    setContentEditor({ setId: set.id, loading: true, questions: [] });
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Bạn cần đăng nhập để sửa nội dung bộ đề.');

      const response = await fetch(`${apiUrl('/practice-content')}?id=${encodeURIComponent(set.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const content = await response.json().catch(() => null);
      if (!response.ok) throw new Error(content?.error || 'Không thể tải nội dung bộ đề.');

      const questions = normalizeEditableQuestions(content.questions || []);
      setContentEditor({ setId: set.id, questions });
    } catch (err: any) {
      setContentEditor(null);
      setError(err.message || 'Không thể mở trình sửa nội dung.');
    }
  };

  const updateContentQuestion = (questionIndex: number, patch: Partial<EditableQuestion>) => {
    setContentEditor((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        questions: prev.questions.map((question, index) => index === questionIndex ? { ...question, ...patch } : question),
      };
    });
  };

  const updateContentOption = (questionIndex: number, optionKey: string, value: string) => {
    setContentEditor((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        questions: prev.questions.map((question, index) => index === questionIndex
          ? { ...question, options: { ...question.options, [optionKey]: value } }
          : question),
      };
    });
  };

  const addContentQuestion = () => {
    setContentEditor((prev) => {
      if (!prev) return prev;
      const nextIndex = prev.questions.length + 1;
      return {
        ...prev,
        questions: [
          ...prev.questions,
          {
            id: `q${nextIndex}`,
            question: '',
            options: { A: '', B: '', C: '', D: '' },
            correctAnswer: 'A',
            explanation: '',
          },
        ],
      };
    });
  };

  const removeContentQuestion = (questionIndex: number) => {
    setContentEditor((prev) => {
      if (!prev) return prev;
      return { ...prev, questions: prev.questions.filter((_, index) => index !== questionIndex) };
    });
  };

  const saveContentEditor = async (set: PracticeSetRow) => {
    if (!contentEditor || contentEditor.setId !== set.id) return;
    playClick();
    setError('');
    setContentEditor((prev) => prev ? { ...prev, saving: true } : prev);
    try {
      const cleanQuestions = contentEditor.questions.map((question, index) => ({
        ...question,
        id: question.id.trim() || `q${index + 1}`,
        question: question.question.trim(),
        options: Object.fromEntries(Object.entries(question.options).map(([key, value]) => [key, value.trim()])),
        correctAnswer: question.correctAnswer.trim().toUpperCase().slice(0, 1),
        explanation: question.explanation.trim(),
      }));

      const invalidIndex = cleanQuestions.findIndex((question) => {
        const validOptions = Object.entries(question.options).filter(([, value]) => value);
        return !question.question || validOptions.length < 2 || !question.options[question.correctAnswer];
      });
      if (invalidIndex >= 0) throw new Error(`Câu ${invalidIndex + 1} chưa hợp lệ. Cần nội dung câu hỏi, ít nhất 2 đáp án và đáp án đúng phải có nội dung.`);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Bạn cần đăng nhập để lưu nội dung bộ đề.');

      const response = await fetch(apiUrl('/practice-import'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: 'update-content',
          setId: set.id,
          quiz: {
            quizId: set.id,
            title: set.title,
            questions: cleanQuestions,
          },
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Không thể lưu nội dung bộ đề.');

      setLibrarySets((rows) => rows.map((row) => row.id === set.id ? { ...row, question_count: result.questionCount || cleanQuestions.length } : row));
      setContentEditor({ setId: set.id, questions: cleanQuestions });
    } catch (err: any) {
      setError(err.message || 'Không thể lưu nội dung bộ đề.');
      setContentEditor((prev) => prev ? { ...prev, saving: false } : prev);
    }
  };

  const deletePracticeSet = async (set: PracticeSetRow) => {
    if (currentRole !== 'admin') {
      setError('Chỉ admin mới được xóa bộ đề.');
      return;
    }
    if (!window.confirm(`Xóa bộ đề "${set.title}"? Lịch sử làm bài liên quan cũng sẽ bị xóa.`)) return;

    playClick();
    setError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Bạn cần đăng nhập để xóa bộ đề.');

      const response = await fetch(apiUrl('/practice-import'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'delete-set', setId: set.id }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Không thể xóa bộ đề.');

      const remaining = librarySets.filter((row) => row.id !== set.id);
      setLibrarySets(remaining);
      setOpenOptionsSetId(null);
      setContentEditor((prev) => prev?.setId === set.id ? null : prev);
      if (!remaining.some((row) => row.subject_name === subjectFilter)) {
        setSubjectFilter(remaining[0]?.subject_name || '');
      }
    } catch (err: any) {
      setError(err.message || 'Không thể xóa bộ đề.');
    }
  };

  const handleImportPdf = async (file?: File | null, row?: ImportRow) => {
    if (!file) return;
    const form = row || importRows[0];
    playClick();
    setImporting(true);
    if (form?.id) updateImportRow(form.id, { importing: true });
    setImportMessage('Đang đọc nội dung PDF...');
    setError('');

    try {
      if (file.type !== 'application/pdf') throw new Error('Chỉ hỗ trợ file PDF.');
      if (!form.subjectName.trim()) throw new Error('Bạn cần nhập tên môn trước khi import.');

      const sourceText = await extractPdfText(file);
      if (sourceText.length < 200) throw new Error('PDF không trích được đủ chữ. Hãy dùng PDF text rõ hoặc OCR trước.');

      setImportMessage('Đang trích xuất đề gốc và lưu vào Supabase Storage...');
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Bạn cần đăng nhập để thêm bộ đề.');

      const response = await fetch(apiUrl('/practice-import'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subjectName: form.subjectName.trim(),
          courseCode: '',
          chapterTitle: '',
          title: form.title.trim() || file.name.replace(/\.pdf$/i, ''),
          description: '',
          difficulty: 'medium',
          visibility: form.visibility,
          questionCount: 0,
          estimatedMinutes: 20,
          sourceText,
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'Không thể import bộ đề.');
      setImportMessage(`Đã thêm bộ đề ${result.questionCount || 0} câu. Storage key: ${result.contentKey}`);
      await loadLibrary();
      if (result.setId) navigate(`/exam-ai/${result.setId}`);
    } catch (err: any) {
      setImportMessage('');
      setError(err.message || 'Import PDF thất bại.');
    } finally {
      setImporting(false);
      if (form?.id) updateImportRow(form.id, { importing: false });
    }
  };

  const renderAdminImport = () => {
    if (!canManagePractice || setId) return null;

    return (
      <section className="mb-4 overflow-hidden rounded-xl border border-gray-300 bg-white">
        <div className="flex flex-col gap-3 border-b border-gray-200 bg-[#F8FAFC] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-black text-[#003375]"><WandSparkles size={17} /> Quản lý bộ đề PDF</div>
            <p className="mt-1 text-xs font-semibold text-gray-500">Thêm từng dòng đề, chọn PDF tương ứng, hệ thống tự bóc câu hỏi và lưu vào Supabase.</p>
          </div>
          <button onClick={addImportRow} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#003375] bg-white px-3 text-sm font-black text-[#003375] hover:bg-blue-50">
            <Plus size={16} /> Thêm đề
          </button>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            <div className="grid grid-cols-[1.3fr_1.4fr_120px_160px_44px] gap-2 border-b border-gray-200 px-4 py-2 text-[11px] font-black uppercase tracking-wide text-gray-500">
              <span>Môn học</span>
              <span>Tên bộ đề</span>
              <span>Loại</span>
              <span>File PDF</span>
              <span></span>
            </div>
            <div className="divide-y divide-gray-100">
              {importRows.map((row, index) => (
                <div key={row.id} className="grid grid-cols-[1.3fr_1.4fr_120px_160px_44px] gap-2 px-4 py-3">
                  <div className="grid gap-2">
                    <select
                      value={row.subjectMode === 'new' ? '__new__' : row.subjectName}
                      onChange={(event) => {
                        if (event.target.value === '__new__') {
                          updateImportRow(row.id, { subjectMode: 'new', subjectName: '' });
                        } else {
                          updateImportRow(row.id, { subjectMode: 'existing', subjectName: event.target.value });
                        }
                      }}
                      className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm font-bold outline-none focus:border-[#003375]"
                    >
                      {subjectsWithSets.length === 0 && <option value="">Chọn môn</option>}
                      {subjectsWithSets.map((subject) => (
                        <option key={subject.name} value={subject.name}>{subject.name}</option>
                      ))}
                      <option value="__new__">+ Môn mới...</option>
                    </select>
                    {row.subjectMode === 'new' && (
                      <input
                        value={row.subjectName}
                        onChange={(event) => updateImportRow(row.id, { subjectName: event.target.value })}
                        placeholder="Nhập tên môn mới"
                        className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold outline-none focus:border-[#003375]"
                      />
                    )}
                  </div>
                  <input value={row.title} onChange={(event) => updateImportRow(row.id, { title: event.target.value })} placeholder={`Đề ${index + 1}`} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm font-semibold outline-none focus:border-[#003375]" />
                  <select value={row.visibility} onChange={(event) => updateImportRow(row.id, { visibility: event.target.value })} className="h-10 rounded-lg border border-gray-300 bg-white px-3 text-sm font-bold outline-none focus:border-[#003375]">
                    <option value="public">Free</option>
                    <option value="pro">Pro</option>
                    <option value="private">Private</option>
                  </select>
                  <label className={`flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 text-sm font-black transition-colors ${importing || row.importing ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400' : 'border-[#003375] bg-[#003375] text-white hover:bg-[#002855]'}`}>
                    {row.importing ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
                    Upload
                    <input type="file" accept="application/pdf" disabled={importing || row.importing} className="hidden" onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      handleImportPdf(file, row);
                    }} />
                  </label>
                  <button type="button" onClick={() => removeImportRow(row.id)} disabled={importRows.length === 1 || importing} className="grid h-10 place-items-center rounded-lg border border-gray-200 text-gray-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {importMessage && (
          <div className="mx-4 mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
            {importMessage}
          </div>
        )}
      </section>
    );
  };

  const renderLibrary = () => (
    <div className="w-full pb-10 text-[#0D1B3E] animate-slideInRight">
      <section className="relative md:sticky top-0 z-40 -mt-2 mb-4 border-b border-transparent bg-[#F8FAFC] pb-4 pt-2 md:border-gray-200/60 md:shadow-[0_8px_10px_-10px_rgba(0,0,0,0.05)]">
        <div>
          <h1 className="text-2xl font-black text-[#003375] sm:text-[28px]">Luyện đề</h1>
          <p className="mt-1 text-xs font-medium italic text-gray-500">Chọn môn học và bộ đề để bắt đầu ôn tập hiệu quả.</p>
        </div>
      </section>

      {renderAdminImport()}
      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-4">
          <div className="rounded-xl border border-gray-300 bg-white p-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(320px,1fr)_auto] lg:items-center">
              <div className="flex min-w-0 items-center gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#003375]">
                  <BookOpen size={24} />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-wide text-gray-500">Môn học hiện tại</p>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                    <h2 className="min-w-0 truncate text-base font-black text-gray-900 sm:text-lg">{selectedSubjectName}</h2>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">Miễn phí</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-[96px] rounded-xl border border-gray-300 bg-[#F8FAFC] px-3 py-2">
                  <p className="text-base font-black text-gray-900">{subjectSets.length}</p>
                  <p className="text-xs font-bold text-gray-500">Bộ đề</p>
                </div>
                <div className="min-w-[96px] rounded-xl border border-gray-300 bg-[#F8FAFC] px-3 py-2">
                  <p className="text-base font-black text-gray-900">{totalQuestionCount}</p>
                  <p className="text-xs font-bold text-gray-500">Câu hỏi</p>
                </div>
                <div className="min-w-[96px] rounded-xl border border-gray-300 bg-[#F8FAFC] px-3 py-2">
                  <p className="text-base font-black text-gray-900">{totalEstimatedMinutes || 0} phút</p>
                  <p className="text-xs font-bold text-gray-500">Ước tính</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-300 bg-white p-3">
            <div className="grid gap-3 xl:grid-cols-[minmax(280px,1fr)_320px_auto] xl:items-end">
              <label className="block">
                <span className="mb-1.5 block text-xs font-black text-gray-500">Tìm kiếm</span>
                <span className="relative block">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Tìm bộ đề, chương, mã học phần..." className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-10 pr-3 text-sm font-semibold outline-none transition-all hover:border-blue-300 focus:border-[#003375] focus:ring-1 focus:ring-[#003375]" />
                </span>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-xs font-black text-gray-500">Môn học</span>
                <select value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)} className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm font-bold text-gray-700 outline-none transition-all hover:border-blue-300 focus:border-[#003375] focus:ring-1 focus:ring-[#003375]">
                  {subjectsWithSets.map((subject) => <option key={subject.name} value={subject.name}>{subject.name} ({subject.count})</option>)}
                </select>
              </label>

              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'all', label: 'Tất cả' },
                  { key: 'todo', label: 'Chưa làm' },
                  { key: 'done', label: 'Đã làm' },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setStudyFilter(item.key as 'all' | 'todo' | 'done')}
                    className={`h-10 rounded-lg border px-4 text-xs font-black transition-colors ${studyFilter === item.key ? 'border-[#003375] bg-[#003375] text-white' : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <section className="overflow-visible rounded-xl border border-gray-300 bg-white">
            <div className="flex flex-col gap-3 border-b border-gray-200 bg-[#F8FAFC] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <BookOpen className="mt-0.5 text-[#003375]" size={20} />
                <div>
                  <h2 className="text-base font-black text-gray-900">Kho luyện đề</h2>
                  <p className="mt-0.5 text-xs font-semibold text-gray-500">Bắt đầu với từng chương, sau đó làm đề tổng hợp để kiểm tra mức độ nắm bài.</p>
                </div>
              </div>
              <button type="button" className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-xs font-black text-[#003375] hover:bg-blue-50">
                Sắp xếp: Mới nhất
              </button>
            </div>

            {loadingLibrary ? (
              <div className="grid min-h-56 place-items-center">
                <Loader2 size={28} className="animate-spin text-[#003375]" />
              </div>
            ) : visibleSubjectSets.length === 0 ? (
              <div className="m-4 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-6 text-sm font-semibold leading-6 text-gray-500">
                Chưa có bộ đề phù hợp với bộ lọc hiện tại.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {visibleSubjectSets.map((item) => {
                  const draft = editingSets[item.id] || { subject_name: item.subject_name, title: item.title };
                  const changed = draft.subject_name !== item.subject_name || draft.title !== item.title;
                  const isOptionsOpen = openOptionsSetId === item.id;
                  const estimatedMinutes = item.estimated_minutes || Math.max(1, Math.ceil((item.question_count || 1) * 1.2));
                  const isPro = item.visibility === 'pro';
                  const isPrivate = item.visibility === 'private';
                  const attempt = attemptsBySet[item.id];
                  const hasAttempt = Boolean(attempt);
                  const scoreLabel = attempt?.total_questions ? formatScore10(attempt.correct_count, attempt.total_questions) : '-';

                  return (
                    <article key={item.id} className="relative">
                      <div className="grid gap-3 px-4 py-3 transition-colors hover:bg-gray-50 xl:grid-cols-[minmax(260px,1fr)_80px_100px_90px_138px_20px] xl:items-center">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${isPro ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-[#003375]'}`}>
                            {isPro ? <Trophy size={22} /> : <FileText size={22} />}
                          </div>
                          <div className="min-w-0">
                            <h3 className="line-clamp-1 text-sm font-black text-gray-900 sm:text-base">{item.title}</h3>
                            <p className="mt-0.5 line-clamp-1 text-xs font-semibold text-gray-500">{item.description || item.subject_name}</p>
                            <div className={`mt-2 flex items-center gap-2 text-xs font-bold ${hasAttempt ? 'text-emerald-700' : 'text-gray-500'}`}>
                              <span className={`h-2 w-2 rounded-full ${hasAttempt ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                              {hasAttempt ? `Đã làm · Điểm cao nhất: ${scoreLabel}/10` : 'Chưa làm'}
                            </div>
                          </div>
                        </div>

                        <div className="text-sm font-black text-gray-800 xl:text-center">
                          {item.question_count || 0}
                          <span className="mt-0.5 block text-xs font-bold text-gray-500">câu hỏi</span>
                        </div>

                        <div className="text-sm font-black text-gray-800 xl:text-center">
                          {estimatedMinutes} phút
                          <span className="mt-0.5 block text-xs font-bold text-gray-500">ước tính</span>
                        </div>

                        <div>
                          <span className={`inline-flex h-7 items-center rounded-full px-3 text-xs font-black ${isPrivate ? 'bg-gray-100 text-gray-600' : isPro ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
                            {visibilityLabel(item.visibility)}
                          </span>
                        </div>

                        <div className="relative flex items-center gap-2">
                          {canManagePractice && (
                            <button onClick={() => setOpenOptionsSetId(isOptionsOpen ? null : item.id)} className="grid h-10 w-10 place-items-center rounded-full border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50">
                              <MoreHorizontal size={18} />
                            </button>
                          )}
                          <Link to={'/exam-ai/' + item.id} onClick={playClick} className="inline-flex h-9 items-center justify-center rounded-lg bg-[#003375] px-4 text-sm font-black text-white shadow-sm hover:bg-[#002855]">
                            {hasAttempt ? 'Làm lại' : 'Làm bài'}
                          </Link>

                          {canManagePractice && isOptionsOpen && (
                            <div className="absolute right-14 top-12 z-50 w-[280px] max-w-[calc(100vw-32px)] rounded-2xl border border-gray-200 bg-white py-2 shadow-[0_18px_40px_rgba(15,23,42,0.18)]">
                              <div className="absolute -top-2 right-7 h-4 w-4 rotate-45 border-l border-t border-gray-200 bg-white" />
                              <div className="relative max-h-[280px] overflow-y-auto px-2">
                                <button onClick={() => { setOpenInfoEditorSetId(openInfoEditorSetId === item.id ? null : item.id); setOpenOptionsSetId(null); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-gray-50">
                                  <span className="grid h-8 w-8 place-items-center rounded-full bg-gray-100 text-gray-700"><Settings2 size={16} /></span>
                                  <span>
                                    <span className="block text-sm font-black text-gray-900">Đổi thông tin</span>
                                    <span className="block text-xs font-semibold text-gray-500">Sửa tên môn và tên bộ đề.</span>
                                  </span>
                                </button>

                                <button onClick={() => { setOpenOptionsSetId(null); setOpenInfoEditorSetId(null); contentEditor?.setId === item.id ? setContentEditor(null) : loadContentEditor(item); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-gray-50">
                                  <span className="grid h-8 w-8 place-items-center rounded-full bg-blue-50 text-[#003375]"><FileText size={16} /></span>
                                  <span>
                                    <span className="block text-sm font-black text-gray-900">{contentEditor?.setId === item.id ? 'Đóng sửa nội dung' : 'Sửa nội dung'}</span>
                                    <span className="block text-xs font-semibold text-gray-500">Chỉnh câu hỏi, lựa chọn và đáp án.</span>
                                  </span>
                                </button>

                                {currentRole === 'admin' && (
                                  <button onClick={() => { setOpenOptionsSetId(null); deletePracticeSet(item); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-red-50">
                                    <span className="grid h-8 w-8 place-items-center rounded-full bg-red-50 text-red-600"><Trash2 size={16} /></span>
                                    <span>
                                      <span className="block text-sm font-black text-red-600">Xóa bộ đề</span>
                                      <span className="block text-xs font-semibold text-red-500">Xóa metadata và file nội dung.</span>
                                    </span>
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>

                        <ChevronRight className="hidden text-gray-300 xl:block" size={20} />
                      </div>

                      {openInfoEditorSetId === item.id && (
                        <div className="border-t border-gray-100 bg-gray-50 px-4 py-4">
                          <div className="grid gap-2 rounded-xl border border-gray-200 bg-white p-3 sm:grid-cols-[1fr_1fr_auto]">
                            <input value={draft.subject_name} onChange={(event) => updateEditingSet(item, { subject_name: event.target.value })} placeholder="Tên môn" className="h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm font-bold outline-none focus:border-[#003375]" />
                            <input value={draft.title} onChange={(event) => updateEditingSet(item, { title: event.target.value })} placeholder="Tên bộ đề" className="h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm font-bold outline-none focus:border-[#003375]" />
                            <div className="flex gap-2">
                              <button onClick={() => saveSetMetadata(item)} disabled={!changed || draft.saving} className="h-11 flex-1 rounded-xl border border-[#003375] bg-white px-4 text-xs font-black text-[#003375] hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40">
                                {draft.saving ? 'Đang lưu' : 'Lưu'}
                              </button>
                              <button onClick={() => setOpenInfoEditorSetId(null)} className="h-11 rounded-xl border border-gray-300 bg-white px-3 text-xs font-black text-gray-600 hover:bg-gray-50">
                                Đóng
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {contentEditor?.setId === item.id && (
                        <div className="border-t border-gray-100 bg-gray-50 px-4 py-4">
                          <div className="rounded-xl border border-gray-200 bg-white">
                            <div className="flex flex-col gap-2 border-b border-gray-200 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-sm font-black text-gray-900">Sửa câu hỏi và đáp án</p>
                                <p className="mt-0.5 text-xs font-semibold text-gray-500">Lưu xong hệ thống ghi đè JSON của bộ đề trong Supabase Storage.</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button onClick={addContentQuestion} disabled={contentEditor.loading || contentEditor.saving} className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-xs font-black text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                                  <Plus size={15} /> Thêm câu
                                </button>
                                <button onClick={() => saveContentEditor(item)} disabled={contentEditor.loading || contentEditor.saving} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#003375] px-3 text-xs font-black text-white hover:bg-[#002855] disabled:opacity-50">
                                  {contentEditor.saving ? <Loader2 size={15} className="animate-spin" /> : null}
                                  Lưu nội dung
                                </button>
                              </div>
                            </div>

                            {contentEditor.loading ? (
                              <div className="grid min-h-32 place-items-center">
                                <Loader2 size={24} className="animate-spin text-[#003375]" />
                              </div>
                            ) : (
                              <div className="max-h-[560px] space-y-3 overflow-y-auto p-3">
                                {contentEditor.questions.map((question, questionIndex) => {
                                  const keys = Object.keys(question.options).length ? Object.keys(question.options) : optionKeys;
                                  return (
                                    <div key={question.id + '-' + questionIndex} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                                      <div className="mb-2 flex items-center justify-between gap-2">
                                        <span className="text-xs font-black uppercase tracking-wide text-gray-500">Câu {questionIndex + 1}</span>
                                        <button onClick={() => removeContentQuestion(questionIndex)} disabled={contentEditor.questions.length === 1} className="grid h-8 w-8 place-items-center rounded-lg border border-gray-200 bg-white text-gray-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-40">
                                          <Trash2 size={15} />
                                        </button>
                                      </div>
                                      <textarea value={question.question} onChange={(event) => updateContentQuestion(questionIndex, { question: event.target.value })} rows={3} placeholder="Nội dung câu hỏi" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold leading-6 outline-none focus:border-[#003375]" />
                                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                                        {keys.map((key) => (
                                          <label key={key} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-2">
                                            <input type="radio" checked={question.correctAnswer === key} onChange={() => updateContentQuestion(questionIndex, { correctAnswer: key })} />
                                            <span className="w-5 shrink-0 text-sm font-black text-[#003375]">{key}</span>
                                            <input value={question.options[key] || ''} onChange={(event) => updateContentOption(questionIndex, key, event.target.value)} placeholder={'Đáp án ' + key} className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none" />
                                          </label>
                                        ))}
                                      </div>
                                      <textarea value={question.explanation} onChange={(event) => updateContentQuestion(questionIndex, { explanation: event.target.value })} rows={2} placeholder="Giải thích đáp án nếu có" className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold leading-6 outline-none focus:border-[#003375]" />
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between border-t border-gray-200 bg-[#F8FAFC] px-4 py-3 text-xs font-bold text-gray-500">
              <span>Hiển thị {visibleSubjectSets.length} bộ đề</span>
              {loadingLibrary && <Loader2 size={15} className="animate-spin" />}
            </div>
          </section>
        </section>

        <aside className="space-y-4">
          <section className="rounded-xl border border-gray-300 bg-white p-4">
            <h3 className="text-base font-black text-gray-900">Tiến độ học tập</h3>
            <div className="mt-4 flex items-center gap-4">
              <div className="relative grid h-24 w-24 shrink-0 place-items-center rounded-full">
                <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 36 36" aria-hidden="true">
                  <circle cx="18" cy="18" r="15.5" fill="none" stroke="#EDF1F6" strokeWidth="5" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke="#003375"
                    strokeLinecap="round"
                    strokeWidth="5"
                    pathLength="100"
                    strokeDasharray="100"
                    strokeDashoffset={100 - completionPercent}
                  />
                </svg>
                <div className="relative grid h-16 w-16 place-items-center rounded-full bg-white text-center">
                  <div>
                    <p className="text-xl font-black text-gray-900">{completionPercent}%</p>
                    <p className="text-[11px] font-bold text-gray-500">Hoàn thành</p>
                  </div>
                </div>
              </div>
              <div className="grid flex-1 gap-2">
                <div className="border-b border-gray-100 pb-2">
                  <p className="text-sm font-black text-gray-950">{completedSets}/{subjectSets.length}</p>
                  <p className="text-xs font-bold text-gray-500">Bộ đề đã làm</p>
                </div>
                <div className="border-b border-gray-100 pb-2">
                  <p className="text-sm font-black text-gray-950">{answeredQuestions}/{totalQuestionCount}</p>
                  <p className="text-xs font-bold text-gray-500">Câu hỏi đã làm</p>
                </div>
                <div>
                  <p className="text-sm font-black text-gray-950">{bestScoreLabel}</p>
                  <p className="text-xs font-bold text-gray-500">Điểm cao nhất</p>
                </div>
              </div>
            </div>
            <button type="button" className="mt-4 h-10 w-full rounded-lg border border-gray-300 bg-white text-sm font-black text-[#003375] hover:bg-blue-50">
              Xem chi tiết tiến độ
            </button>
          </section>

          <section className="rounded-xl border border-gray-300 bg-white p-4">
            <h3 className="text-base font-black text-gray-900">Mức độ sẵn sàng</h3>
            <p className="mt-1 text-sm font-semibold text-gray-500">Hoàn thành thêm các bộ đề để hệ thống ghi nhận tiến độ ôn tập.</p>
            <div className="mt-4">
              <div className="mb-2 flex justify-between text-xs font-black text-gray-500">
                <span>Tiến độ môn học</span>
                <span>{completionPercent}%</span>
              </div>
              <progress className="exam-progress-bar h-2 w-full overflow-hidden rounded-full bg-gray-100" value={completionPercent} max={100} />
            </div>
          </section>

          <section className="rounded-xl border border-gray-300 bg-white p-4">
            <h3 className="text-base font-black text-gray-900">Gợi ý ôn tập</h3>
            <div className="mt-4 grid gap-2">
              {[
                { key: 'chapter', title: 'Ôn tập theo chương', desc: 'Lọc các bộ đề chưa làm để nắm chắc kiến thức nền tảng.' },
                { key: 'comprehensive', title: 'Làm đề tổng hợp', desc: 'Mở đề tổng hợp, giữa kỳ hoặc cuối kỳ nếu môn này có.' },
                { key: 'mistakes', title: 'Xem lại câu sai', desc: 'Mở bộ đề đã làm có điểm thấp nhất để ôn lại.' },
              ].map((item) => (
                <button key={item.key} type="button" onClick={() => handleStudySuggestion(item.key as 'chapter' | 'comprehensive' | 'mistakes')} className="grid grid-cols-[38px_1fr_18px] items-center gap-3 rounded-lg border border-gray-200 bg-[#F8FAFC] p-3 text-left transition-all hover:border-blue-300 hover:bg-blue-50/40 active:scale-[0.99]">
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-[#003375]">
                    <ClipboardList size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-gray-950">{item.title}</p>
                    <p className="mt-0.5 text-xs font-semibold text-gray-500">{item.desc}</p>
                  </div>
                  <ChevronRight className="text-gray-300" size={18} />
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );

  const renderQuiz = () => (
    <div className="w-full pb-10 text-[#0D1B3E] animate-slideInRight">
      <div className="sticky top-0 z-40 -mt-2 mb-3 border-b border-gray-300 bg-[#F8FAFC] pb-3 pt-2">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <button onClick={() => { playClick(); navigate('/exam-ai'); }} className="mb-2 inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-[#003375]">
              <ArrowLeft size={16} /> Về kho đề
            </button>
            <h1 className="line-clamp-1 text-2xl sm:text-[28px] font-black text-[#003375]">{activeSet?.title || 'Đang tải bộ đề'}</h1>
            <p className="mt-1 text-sm font-semibold text-gray-500">{isWrongReview ? 'Xem lại câu sai' : activeSet?.subject_name}{!isWrongReview && activeSet?.course_code ? ` - ${activeSet.course_code}` : ''}</p>
          </div>

          {!isWrongReview ? (
            <div className="flex flex-wrap items-center gap-2">
              <div className={`flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-black ${timeLeft <= 60 ? 'border-red-200 bg-red-50 text-red-700' : 'border-gray-300 bg-white text-gray-800'}`}>
                <Clock3 size={16} /> {formatTime(timeLeft)}
              </div>
              <div className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3">
                <Settings2 size={16} className="text-gray-400" />
                <select value={answerMode} onChange={(event) => setAnswerMode(event.target.value as AnswerMode)} disabled={submitted} className="bg-transparent text-sm font-bold text-gray-700 outline-none">
                  <option value="after_submit">Hiện đáp án sau khi nộp</option>
                  <option value="instant">Hiện đáp án khi chọn</option>
                </select>
              </div>
              <button onClick={resetAttempt} disabled={!activeSet} className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                <RotateCcw size={16} /> Làm lại
              </button>
            </div>
          ) : (
            <Link to={activeSet ? `/exam-ai/${activeSet.id}` : '/exam-ai'} onClick={playClick} className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-bold text-[#003375] hover:bg-blue-50">
              <RotateCcw size={16} /> Làm lại bài này
            </Link>
          )}
        </div>
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}

      {loadingSet || loadingWrongReview ? (
        <div className="flex min-h-[560px] items-center justify-center rounded-xl border border-gray-300 bg-white">
          <Loader2 size={30} className="animate-spin text-[#003375]" />
        </div>
      ) : !activeSet ? (
        <div className="flex min-h-[560px] flex-col items-center justify-center rounded-xl border border-gray-300 bg-white px-6 text-center">
          <FileText size={42} className="mb-3 text-[#003375]" />
          <h2 className="text-xl font-black text-gray-900">Không mở được bộ đề</h2>
          <p className="mt-2 text-sm font-medium text-gray-500">Quay lại kho đề và chọn lại một bộ đề khác.</p>
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
          <main className="space-y-4">
            {isWrongReview && displayedQuizQuestions.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
                <CheckCircle2 className="mx-auto mb-3 text-emerald-600" size={34} />
                <h2 className="text-lg font-black text-gray-900">Không có câu sai</h2>
                <p className="mt-1 text-sm font-semibold text-gray-500">Bạn chưa làm sai câu nào trong lần làm gần nhất, hoặc chưa có lịch sử làm bài.</p>
              </div>
            )}

            {displayedQuizQuestions.map(({ question, index: questionIndex, key }, displayIndex) => {
              const reviewAnswer = wrongReviewAnswers[key];
              const correctAnswer = reviewAnswer?.correct_answer || question.correct_answer;
              const selected = isWrongReview ? reviewAnswer?.selected_answer || '' : answers[questionIndex];
              const isCorrect = selected === correctAnswer;
              const shouldReveal = isWrongReview || submitted || (answerMode === 'instant' && Boolean(selected));

              return (
                <section key={`${question.id}-${questionIndex}`} className="rounded-xl border border-gray-300 bg-white p-4">
                  <div className="mb-3 flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-black text-[#003375]">{isWrongReview ? displayIndex + 1 : questionIndex + 1}</span>
                    <div>
                      <h4 className="font-black leading-6 text-gray-900">{question.question}</h4>
                      {question.topic_tag && <p className="mt-1 text-xs font-bold text-gray-400">{question.topic_tag}</p>}
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {question.options.map((option) => {
                      const isSelected = selected === option;
                      const shouldMarkCorrect = shouldReveal && option === correctAnswer;
                      const shouldMarkWrong = shouldReveal && isSelected && !isCorrect;

                      return (
                        <button key={option} onClick={() => !isWrongReview && !submitted && setAnswers((prev) => ({ ...prev, [questionIndex]: option }))} className={`flex min-h-12 items-center justify-between rounded-lg border px-3 py-2 text-left text-sm font-bold transition-colors ${shouldMarkCorrect ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : shouldMarkWrong ? 'border-red-300 bg-red-50 text-red-700' : isSelected ? 'border-[#003375] bg-blue-50 text-[#003375]' : 'border-gray-200 hover:bg-gray-50'}`}>
                          <span>{option}</span>
                          {shouldMarkCorrect && <CheckCircle2 size={18} />}
                          {shouldMarkWrong && <XCircle size={18} />}
                        </button>
                      );
                    })}
                  </div>

                  {shouldReveal && (
                    <div className="mt-3 rounded-lg bg-gray-50 p-3 text-sm font-semibold leading-6 text-gray-700">
                      {isWrongReview && selected && <><span className="font-black text-red-700">Bạn chọn: </span>{selected}<br /></>}
                      <span className="font-black text-gray-900">Đáp án: </span>{correctAnswer}
                      {question.explanation && <><br /><span className="font-black text-gray-900">Giải thích: </span>{question.explanation}</>}
                    </div>
                  )}
                </section>
              );
            })}
          </main>

          <aside className="h-fit rounded-xl border border-gray-300 bg-white p-4 xl:sticky xl:top-28">
            <div className="flex items-center gap-2 text-[#003375]">
              <Trophy size={20} />
              <h2 className="text-base font-black">{isWrongReview ? 'Câu sai' : 'Tiến độ'}</h2>
            </div>
            <p className="mt-4 text-3xl font-black text-gray-900">{isWrongReview ? displayedQuizQuestions.length : Object.keys(answers).length}/{activeSet.questions.length}</p>
            <p className="mt-1 text-sm font-semibold text-gray-500">{isWrongReview ? 'Câu cần xem lại' : 'Câu đã chọn'}</p>

            {!isWrongReview && submitted && (
              <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-emerald-800">
                <p className="text-sm font-bold">Kết quả</p>
                <p className="text-2xl font-black">{formatScore10(score.correct, score.total)}/10</p>
                <p className="mt-1 text-xs font-bold text-emerald-700">{score.correct}/{score.total} câu đúng · {score.total ? (10 / score.total).toFixed(2) : '0'} điểm/câu</p>
              </div>
            )}

            {isWrongReview ? (
              <Link to={`/exam-ai/${activeSet.id}`} onClick={playClick} className="mt-4 flex w-full justify-center rounded-lg bg-[#003375] px-5 py-3 text-sm font-black text-white shadow-sm active:scale-95">
                Làm lại bài này
              </Link>
            ) : (
              <button onClick={submitted ? resetAttempt : handleSubmitQuiz} disabled={!submitted && !allAnswered} className="mt-4 w-full rounded-lg bg-[#003375] px-5 py-3 text-sm font-black text-white shadow-sm active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-300">
                {submitted ? 'Làm lại bài này' : allAnswered ? 'Nộp bài' : 'Chọn hết câu để nộp'}
              </button>
            )}
          </aside>
        </div>
      )}
    </div>
  );

  return setId ? renderQuiz() : renderLibrary();
};
