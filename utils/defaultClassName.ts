import { supabase } from './supabase';

export const fetchDefaultClassName = async (studentCode: string) => {
    const normalizedCode = studentCode.trim();
    if (!normalizedCode) return '';

    try {
        const { data: orderedData, error: orderedError } = await supabase
            .from('v_drl_ranking')
            .select('class_name, semester_id')
            .eq('student_code', normalizedCode)
            .not('class_name', 'is', null)
            .order('semester_id', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!orderedError && orderedData?.class_name) {
            return String(orderedData.class_name).trim();
        }
    } catch (error) {
        console.warn('Không thể đọc lớp mặc định theo semester_id:', error);
    }

    try {
        const { data: fallbackData, error: fallbackError } = await supabase
            .from('v_drl_ranking')
            .select('class_name')
            .eq('student_code', normalizedCode)
            .not('class_name', 'is', null)
            .limit(1)
            .maybeSingle();

        if (!fallbackError && fallbackData?.class_name) {
            return String(fallbackData.class_name).trim();
        }
    } catch (error) {
        console.warn('Không thể đọc lớp mặc định:', error);
    }

    return '';
};
