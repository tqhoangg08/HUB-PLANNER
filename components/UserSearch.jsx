import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { supabase } from '../utils/supabase';

const UserSearch = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const navigate = useNavigate();
  const searchRef = useRef(null);

  // Xử lý tìm kiếm khi gõ (Debounce nhẹ)
  useEffect(() => {
    const searchUsers = async () => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }

      // Tìm theo Tên hoặc MSSV
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, student_code, avatar_url')
        .or(`full_name.ilike.%${query}%,student_code.ilike.%${query}%`)
        .limit(5);

      if (!error && data) {
        setResults(data);
        setShowDropdown(true);
      }
    };

    const timeoutId = setTimeout(searchUsers, 300); 
    return () => clearTimeout(timeoutId);
  }, [query]);

  // Đóng dropdown khi click ra ngoài
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectUser = (studentCode) => {
    navigate(`/profile/${studentCode}`);
    setShowDropdown(false);
    setQuery('');
  };

  return (
    // Thanh tìm kiếm giữ nguyên kích thước nhỏ gọn (w-40)
    <div className="relative hidden md:block w-40 ml-2" ref={searchRef}>
      <div className="relative">
        <input
          type="text"
          placeholder="Tìm MSSV..."
          className="w-full pl-9 pr-2 py-1.5 rounded-full border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:border-[#003375] focus:ring-1 focus:ring-[#003375] transition-all text-xs"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length >= 2 && setShowDropdown(true)}
        />
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <Search size={14} />
        </div>
        {query && (
          <button 
            onClick={() => { setQuery(''); setResults([]); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* DROPDOWN GỢI Ý - ĐÃ SỬA: Thêm w-72 (rộng hơn thanh tìm kiếm) và bỏ right-0 */}
      {showDropdown && results.length > 0 && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50 animate-fadeIn">
          {results.map((user) => (
            <div
              key={user.id}
              onClick={() => handleSelectUser(user.student_code)}
              className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-50 last:border-0"
            >
              <img
                src={user.avatar_url || `https://ui-avatars.com/api/?name=${user.full_name}&background=random`}
                alt="avatar"
                className="w-10 h-10 rounded-full object-cover border border-gray-200 flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{user.full_name}</p>
                <p className="text-xs text-gray-500 truncate font-mono">@{user.student_code}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* DROPDOWN KHÔNG TÌM THẤY - Cũng sửa rộng ra cho đồng bộ */}
      {showDropdown && query.length >= 2 && results.length === 0 && (
        <div className="absolute top-full left-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 p-4 text-center z-50">
            <p className="text-sm text-gray-500">Không tìm thấy kết quả nào.</p>
        </div>
      )}
    </div>
  );
};

export default UserSearch;