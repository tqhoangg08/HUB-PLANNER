import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';

export const useAdminCheck = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdmin = async () => {
      // Safety check: If supabase is not initialized (e.g. missing env vars), stop here.
      if (!supabase) {
        setLoading(false);
        return;
      }

      try {
        // 1. Get current authenticated user
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          setIsAdmin(false);
          setLoading(false);
          return;
        }

        // 2. Query user_roles table
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (error || !data) {
          // User might not have a role record, treat as not admin
          setIsAdmin(false);
        } else {
          // 3. Verify if role is exactly 'admin'
          setIsAdmin(data.role === 'admin');
        }
      } catch (err) {
        console.error('Unexpected error in useAdminCheck:', err);
        setIsAdmin(false);
      } finally {
        setLoading(false);
      }
    };

    checkAdmin();
  }, []);

  return { isAdmin, loading };
};