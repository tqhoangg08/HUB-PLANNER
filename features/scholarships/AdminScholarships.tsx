import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowLeft,
  Award,
  Check,
  CheckCircle2,
  Clock,
  Database,
  Eye,
  FileCheck,
  FileSpreadsheet,
  FileText,
  History,
  Info,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Table,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { ScholarshipShell } from './ScholarshipShell';
import { useUserRole } from '../../hooks/useUserRole';
import {
  fetchAdminCampaigns,
  createAdminCampaign,
  fetchAdminCampaign,
  updateAdminCampaign,
  fetchAdminImports,
  fetchAdminImportRows,
  fetchAdminAudit,
  previewAdminImport,
  applyAdminImport,
  approveAdminCampaign,
  publishAdminCampaign,
  unpublishAdminCampaign,
  rollbackAdminCampaign,
  archiveAdminCampaign,
  type AdminCampaign,
  type ImportMetadata,
  type PrivateSnapshotRow,
  type AuditEvent,
  type ImportPreviewResponse,
  type PaginatedImportRows,
  ScholarshipApiError,
} from '../../utils/scholarshipApi';
import { playClick } from '../../utils/audio';

export const AdminScholarships: React.FC = () => {
  const { isAdmin, loading: authLoading } = useUserRole();

  // Campaign management state
  const [campaigns, setCampaigns] = useState<AdminCampaign[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [activeCampaign, setActiveCampaign] = useState<AdminCampaign | null>(null);
  const selectedRef = useRef(selectedSlug);
  selectedRef.current = selectedSlug;
  const [candidate, setCandidate] = useState<PaginatedImportRows | null>(null);
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [listError, setListError] = useState<string | null>(null);

  // Tab navigation in campaign view
  const [activeTab, setActiveTab] = useState<'details' | 'ingestion' | 'approval' | 'history'>('details');

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [actionConfirm, setActionConfirm] = useState<{
    type: 'publish' | 'unpublish' | 'rollback' | 'archive';
    title: string;
    description: string;
    batchId?: string;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Create form state
  const [createSlug, setCreateSlug] = useState('');
  const [createTitle, setCreateTitle] = useState('');
  const [createSchoolYear, setCreateSchoolYear] = useState('2025-2026');
  const [createSemester, setCreateSemester] = useState('HK1');

  // Edit form state
  const [editTitle, setEditTitle] = useState('');
  const [editSchoolYear, setEditSchoolYear] = useState('');
  const [editSemester, setEditSemester] = useState('');

  // Import Ingestion State (offline prepared JSON)
  const [jsonFileContent, setJsonFileContent] = useState<string | null>(null);
  const [jsonFileName, setJsonFileName] = useState<string>('');
  const [previewResult, setPreviewResult] = useState<ImportPreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [importRows, setImportRows] = useState<PrivateSnapshotRow[]>([]);
  const [loadingRows, setLoadingRows] = useState<boolean>(false);

  // Approval Form State
  const [approvalTitle, setApprovalTitle] = useState('');
  const [approvalRef, setApprovalRef] = useState('');
  const [approvalUrl, setApprovalUrl] = useState('');
  const [republicationConfirmed, setRepublicationConfirmed] = useState(false);
  const [approvedFields, setApprovedFields] = useState<Set<string>>(
    new Set(['fullName', 'studentCode', 'awardType']),
  );

  // History & Audit State
  const [importsHistory, setImportsHistory] = useState<ImportMetadata[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // 1. Fetch campaigns list
  const loadCampaigns = async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const all: AdminCampaign[] = [];
      let page = 1;
      while (true) {
        const data = await fetchAdminCampaigns({ page, limit: 50 });
        all.push(...data.campaigns);
        if (page * data.limit >= data.total) break;
        if (!data.campaigns.length || page >= 10000) throw new Error('Incomplete pagination');
        page++;
      }
      setCampaigns(all);
      if (all.length > 0 && !selectedRef.current) {
        setSelectedSlug(all[0].slug);
      }
    } catch (err) {
      setListError(err instanceof ScholarshipApiError ? err.message : 'Không thể tải danh sách chiến dịch.');
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    if (!authLoading && isAdmin) {
      void loadCampaigns();
    }
  }, [isAdmin, authLoading]);

  // 2. Fetch campaign details when selectedSlug changes
  const loadSelectedCampaign = async (slug: string) => {
    try {
      const data = await fetchAdminCampaign(slug);
      if (selectedRef.current !== slug) return;
      setActiveCampaign(data.campaign);
      setEditTitle(data.campaign.title);
      setEditSchoolYear(data.campaign.schoolYear);
      setEditSemester(data.campaign.semester);
    } catch (err) {
      if (selectedRef.current === slug) setActionError(err instanceof Error ? err.message : 'Không thể tải đợt học bổng.');
    }
  };

  useEffect(() => {
    setActiveCampaign(null); setCandidate(null); setPreviewResult(null); setImportRows([]);
    setJsonFileContent(null); setJsonFileName(''); setActionError(null); setActionConfirm(null);
    setApprovalTitle(''); setApprovalRef(''); setApprovalUrl(''); setRepublicationConfirmed(false);
    setApprovedFields(new Set(['fullName', 'studentCode', 'awardType']));
    if (selectedSlug) {
      void loadSelectedCampaign(selectedSlug);
    } else {
      setActiveCampaign(null);
    }
  }, [selectedSlug]);

  useEffect(() => {
    const controller = new AbortController();
    setCandidate(null);
    setApprovedFields(new Set(['fullName', 'studentCode', 'awardType']));
    setRepublicationConfirmed(false);
    if (activeCampaign?.candidateBatchId) {
      fetchAdminImportRows(activeCampaign.slug, activeCampaign.candidateBatchId, { limit: 1 }, controller.signal)
        .then(result => { if (!controller.signal.aborted) setCandidate(result); })
        .catch(err => { if (!controller.signal.aborted) setActionError(err instanceof Error ? err.message : 'Không thể tải mapping nguồn.'); });
    }
    return () => controller.abort();
  }, [activeCampaign?.slug, activeCampaign?.candidateBatchId]);

  // Load history & rows when activeTab changes
  useEffect(() => {
    const controller = new AbortController();
    setImportsHistory([]); setAuditEvents([]);
    if (!selectedSlug) return;

    if (activeTab === 'history') {
      setLoadingHistory(true);
      Promise.all([
        fetchAdminImports(selectedSlug, { limit: 20 }, controller.signal),
        fetchAdminAudit(selectedSlug, { limit: 30 }, controller.signal),
      ])
        .then(([imp, aud]) => {
          if (controller.signal.aborted) return;
          setImportsHistory(imp.imports);
          setAuditEvents(aud.audit);
        })
        .catch(err => { if (!controller.signal.aborted) setActionError(err instanceof Error ? err.message : 'Không thể tải lịch sử.'); })
        .finally(() => { if (!controller.signal.aborted) setLoadingHistory(false); });
    }
    return () => controller.abort();
  }, [selectedSlug, activeTab]);

  // Handle JSON file selection (from offline prepare script)
  const handleJsonUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) { setActionError('Tệp JSON tối đa 1 MiB.'); e.target.value = ''; return; }

    setJsonFileName(file.name);
    const uploadSlug = selectedSlug;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (selectedRef.current !== uploadSlug) return;
      const content = event.target?.result as string;
      setJsonFileContent(content);
      setPreviewResult(null);
      setImportRows([]);
    };
    reader.onerror = () => { if (selectedRef.current === uploadSlug) setActionError('Không thể đọc tệp JSON.'); };
    reader.readAsText(file);
  };

  // Run preview on uploaded JSON
  const handleRunPreview = async () => {
    if (!selectedSlug || !jsonFileContent) return;
    setPreviewLoading(true);
    setActionError(null);

    try {
      const parsed = JSON.parse(jsonFileContent);
      const res = await previewAdminImport(selectedSlug, parsed);
      if (selectedRef.current !== selectedSlug) return;
      setPreviewResult(res);

      // If valid, also load rows for inspection
      if (res.valid && res.receipt?.batchId) {
        setLoadingRows(true);
        const rowData = await fetchAdminImportRows(selectedSlug, res.receipt.batchId, { limit: 20 });
        if (selectedRef.current !== selectedSlug) return;
        setImportRows(rowData.rows);
        setLoadingRows(false);
      }
    } catch (err) {
      setActionError(err instanceof ScholarshipApiError ? err.message : 'Dữ liệu JSON không hợp lệ.');
    } finally {
      setPreviewLoading(false);
      setLoadingRows(false);
    }
  };

  // Apply Candidate Batch
  const handleApplyBatch = async () => {
    if (!activeCampaign || !previewResult?.receipt?.batchId) return;
    setActionLoading(true);
    setActionError(null);

    try {
      const res = await applyAdminImport(activeCampaign.slug, {
        expectedRevision: activeCampaign.revision,
        batchId: previewResult.receipt.batchId,
      });
      setActiveCampaign(res.campaign);
      await loadCampaigns();
      alert('Đã apply đợt dữ liệu thành công! Chiến dịch chuyển sang trạng thái validated.');
      setActiveTab('approval');
    } catch (err) {
      setActionError(err instanceof ScholarshipApiError ? err.message : 'Không thể áp dụng đợt dữ liệu.');
    } finally {
      setActionLoading(false);
    }
  };

  // Submit Formal Approval
  const handleSubmitApproval = async () => {
    if (!activeCampaign) return;
    const batchId = activeCampaign.candidateBatchId;
    if (!batchId) {
      alert('Không tìm thấy candidate batch ID để phê duyệt.');
      return;
    }
    if (!approvalTitle.trim() || !approvalRef.trim()) {
      alert('Vui lòng nhập tên quyết định và số hiệu văn bản.');
      return;
    }
    if (!republicationConfirmed) {
      alert('Vui lòng xác nhận đồng ý công bố lại theo phê duyệt của nhà trường.');
      return;
    }

    setActionLoading(true);
    setActionError(null);

    try {
      if (!candidate || candidate.receipt.batchId !== batchId) throw new Error('Chưa tải được dữ liệu nguồn của đợt đang phê duyệt.');
      const sourceSha = candidate.receipt.sourceSha256;

      const res = await approveAdminCampaign(activeCampaign.slug, {
        expectedRevision: activeCampaign.revision,
        batchId,
        sourceSha256: sourceSha,
        officialSource: {
          title: approvalTitle.trim(),
          reference: approvalRef.trim(),
          url: approvalUrl.trim() || null,
        },
        approvedFields: Array.from(approvedFields),
        republicationConfirmed: true,
      });

      setActiveCampaign(res.campaign);
      await loadCampaigns();
      alert('Đã phê duyệt đợt học bổng thành công! Trạng thái: approved.');
    } catch (err) {
      setActionError(err instanceof ScholarshipApiError ? err.message : 'Lỗi phê duyệt chiến dịch.');
    } finally {
      setActionLoading(false);
    }
  };

  // Execute State Transition Mutations with Concurrency Guard
  const handleExecuteStateAction = async () => {
    if (!activeCampaign || !actionConfirm) return;
    setActionLoading(true);
    setActionError(null);

    try {
      let resCampaign: AdminCampaign;

      if (actionConfirm.type === 'publish') {
        const batchId = actionConfirm.batchId || activeCampaign.candidateBatchId || activeCampaign.activeBatchId;
        if (!batchId) throw new Error('Không có đợt dữ liệu để công bố.');
        const res = await publishAdminCampaign(activeCampaign.slug, {
          expectedRevision: activeCampaign.revision,
          batchId,
        });
        resCampaign = res.campaign;
      } else if (actionConfirm.type === 'unpublish') {
        const res = await unpublishAdminCampaign(activeCampaign.slug, {
          expectedRevision: activeCampaign.revision,
        });
        resCampaign = res.campaign;
      } else if (actionConfirm.type === 'rollback') {
        if (!actionConfirm.batchId) throw new Error('Chưa chọn đợt dữ liệu để rollback.');
        const res = await rollbackAdminCampaign(activeCampaign.slug, {
          expectedRevision: activeCampaign.revision,
          batchId: actionConfirm.batchId,
        });
        resCampaign = res.campaign;
      } else {
        // archive
        const res = await archiveAdminCampaign(activeCampaign.slug, {
          expectedRevision: activeCampaign.revision,
        });
        resCampaign = res.campaign;
      }

      setActiveCampaign(resCampaign);
      await loadCampaigns();
      setActionConfirm(null);
    } catch (err) {
      setActionError(err instanceof ScholarshipApiError ? err.message : 'Thao tác thất bại.');
    } finally {
      setActionLoading(false);
    }
  };

  // Check Admin permission
  if (!authLoading && !isAdmin) {
    return (
      <ScholarshipShell>
        <div className="max-w-md mx-auto my-16 p-8 rounded-2xl bg-white border border-red-200 text-center space-y-4 shadow-xs">
          <h2 className="text-lg font-semibold text-red-950">Quyền truy cập bị từ chối</h2>
          <p className="text-xs text-gray-600 leading-relaxed">
            Khu vực này yêu cầu tài khoản quản trị viên (Admin) được ủy quyền chính thức.
          </p>
          <Link
            to="/scholarships"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200"
          >
            <ArrowLeft size={14} />
            <span>Về trang học bổng</span>
          </Link>
        </div>
      </ScholarshipShell>
    );
  }

  return (
    <ScholarshipShell
      title="Quản trị chiến dịch học bổng"
      subtitle="Bảng điều khiển quản lý quy trình nạp dữ liệu, phê duyệt từng trường thông tin và điều phối công bố học bổng."
      headerActions={
        <button
          type="button"
          onClick={() => {
            setShowCreateModal(true);
            playClick();
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors shadow-sm"
        >
          <span>Tạo chiến dịch mới</span>
        </button>
      }
    >
      {/* Loading list */}
      {loadingList && (
        <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
          <p className="text-xs font-semibold text-slate-600">Đang tải danh sách chiến dịch...</p>
        </div>
      )}

      {/* Main Admin Interface */}
      {!loadingList && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Campaigns List (4 cols) */}
          <div className="lg:col-span-4 space-y-4">
            <div className="p-4 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Chiến dịch ({campaigns.length})
                </span>
                <button
                  type="button"
                  onClick={() => void loadCampaigns()}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                  title="Làm mới"
                >
                  <RefreshCw size={14} />
                </button>
              </div>

              {campaigns.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-2xl">
                  Chưa có chiến dịch nào được tạo.
                </div>
              ) : (
                <div className="space-y-2">
                  {campaigns.map((c) => {
                    const isSelected = c.slug === selectedSlug;
                    const statusColors = {
                      draft: 'bg-slate-100 text-slate-700 border-slate-200',
                      validated: 'bg-blue-50 text-blue-700 border-blue-200',
                      approved: 'bg-amber-50 text-amber-800 border-amber-200',
                      published: 'bg-emerald-50 text-emerald-800 border-emerald-200',
                      archived: 'bg-red-50 text-red-700 border-red-200',
                    }[c.status] || 'bg-slate-100 text-slate-700';

                    return (
                      <button
                        key={c.slug}
                        type="button"
                        disabled={actionLoading || previewLoading}
                        onClick={() => {
                          setSelectedSlug(c.slug);
                          playClick();
                        }}
                        className={`w-full text-left p-3.5 rounded-2xl border transition-all ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50/40 shadow-xs ring-1 ring-blue-600/20'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs font-semibold uppercase px-2 py-0.5 rounded-md border ${statusColors}`}>
                            {c.status}
                          </span>
                          <span className="text-xs text-slate-400">
                            rev: {c.revision}
                          </span>
                        </div>

                        <h4 className="mt-2 text-xs font-semibold text-slate-900 line-clamp-1">
                          {c.title}
                        </h4>

                        <div className="mt-1 flex items-center justify-between text-xs text-slate-500 ">
                          <span>{c.schoolYear} ({c.semester})</span>
                          <span>slug: {c.slug}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Selected Campaign Workflow Pipeline (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            {!activeCampaign ? (
              <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 text-slate-400 text-xs">
                Chọn một chiến dịch bên trái để quản lý hoặc tạo mới.
              </div>
            ) : (
              <div className="space-y-6">
                {/* Header Summary & State Transitions */}
                <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-blue-700 px-2 py-0.5 rounded-md bg-blue-50">
                          {activeCampaign.slug}
                        </span>
                        <span className="text-xs font-semibold uppercase px-2.5 py-0.5 rounded-full bg-slate-900 text-white">
                          Trạng thái: {activeCampaign.status}
                        </span>
                        <span className="text-xs text-slate-500">
                          Revision: {activeCampaign.revision}
                        </span>
                      </div>
                      <h2 className="mt-2 text-xl font-semibold text-slate-900">
                        {activeCampaign.title}
                      </h2>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Năm học: {activeCampaign.schoolYear} • Học kỳ: {activeCampaign.semester}
                      </p>
                    </div>

                    {/* State Actions: Publish, Unpublish, Archive */}
                    <div className="flex flex-wrap items-center gap-2">
                      {activeCampaign.status === 'draft' && (
                        <button
                          type="button"
                          onClick={() => setShowEditModal(true)}
                          className="px-3 py-1.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                        >
                          Sửa thông tin
                        </button>
                      )}

                      {activeCampaign.status === 'approved' && (
                        <button
                          type="button"
                          onClick={() => {
                            setActionConfirm({
                              type: 'publish',
                              title: 'Xác nhận công bố học bổng',
                              description: 'Thao tác này sẽ đưa đợt học bổng và danh sách sinh viên được duyệt ra giao diện công khai.',
                            });
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 shadow-xs"
                        >
                          <Send size={14} />
                          <span>Publish (Công bố)</span>
                        </button>
                      )}

                      {activeCampaign.status === 'published' && (
                        <button
                          type="button"
                          onClick={() => {
                            setActionConfirm({
                              type: 'unpublish',
                              title: 'Xác nhận gỡ bỏ công bố',
                              description: 'Thao tác này sẽ ẩn toàn bộ danh sách học bổng khỏi giao diện công khai ngay lập tức.',
                            });
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 shadow-xs"
                        >
                          <RotateCcw size={14} />
                          <span>Unpublish (Ẩn)</span>
                        </button>
                      )}

                      {activeCampaign.status !== 'archived' && (
                        <button
                          type="button"
                          onClick={() => {
                            setActionConfirm({
                              type: 'archive',
                              title: 'Xác nhận lưu trữ chiến dịch',
                              description: 'Lưu trữ là trạng thái kết thúc vĩnh viễn, chiến dịch sẽ không thể rollback hay preview nữa.',
                            });
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold"
                          title="Lưu trữ vĩnh viễn"
                        >
                          <Archive size={14} />
                          <span>Lưu trữ</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Navigation Tabs */}
                  <div className="flex border-b border-slate-100 pt-2 gap-4 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setActiveTab('details')}
                      className={`pb-2.5 transition-colors border-b-2 ${
                        activeTab === 'details'
                          ? 'border-blue-600 text-blue-700'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Tổng quan & Batch
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('ingestion')}
                      className={`pb-2.5 transition-colors border-b-2 ${
                        activeTab === 'ingestion'
                          ? 'border-blue-600 text-blue-700'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Nạp dữ liệu JSON
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('approval')}
                      className={`pb-2.5 transition-colors border-b-2 ${
                        activeTab === 'approval'
                          ? 'border-blue-600 text-blue-700'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Phê duyệt trường công khai
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('history')}
                      className={`pb-2.5 transition-colors border-b-2 ${
                        activeTab === 'history'
                          ? 'border-blue-600 text-blue-700'
                          : 'border-transparent text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Lịch sử & Audit
                    </button>
                  </div>
                </div>

                {/* TAB 1: DETAILS & ACTIVE/CANDIDATE BATCHES */}
                {activeTab === 'details' && (
                  <div className="space-y-4">
                    <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-4 text-xs">
                      <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <span>Trạng thái đợt dữ liệu (Batches)</span>
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
                          <span className="text-xs font-semibold uppercase text-slate-500">Active Batch (Đang công khai):</span>
                          <div className="font-semibold text-slate-900 break-all">
                            {activeCampaign.activeBatchId || '(Chưa có)'}
                          </div>
                        </div>

                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1">
                          <span className="text-xs font-semibold uppercase text-slate-500">Candidate Batch (Chờ công bố):</span>
                          <div className="font-semibold text-slate-900 break-all">
                            {activeCampaign.candidateBatchId || '(Chưa có)'}
                          </div>
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200/60 text-blue-900 space-y-1.5">
                        <div className="font-semibold flex items-center gap-1.5">
                          <Info size={14} />
                          <span>Quy trình nạp và công bố:</span>
                        </div>
                        <p className="text-xs leading-relaxed text-blue-800">
                          1. Chuẩn bị file Excel/CSV offline bằng lệnh <code>node scripts/prepare-scholarship-import.mjs</code>.<br />
                          2. Nạp file JSON vào tab <strong>Nạp dữ liệu JSON</strong> để kiểm tra lỗi và preview.<br />
                          3. Nhấn <strong>Apply</strong> để đưa dữ liệu thành candidate batch.<br />
                          4. Chuyển sang tab <strong>Phê duyệt</strong> để chọn các cột điểm và trường được phép công khai.<br />
                          5. Nhấn <strong>Publish</strong> để kích hoạt danh sách hiển thị công khai.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 2: INGESTION (OFFLINE PREPARED JSON PREVIEW & APPLY) */}
                {activeTab === 'ingestion' && (
                  <div className="space-y-6">
                    <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-4">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                          <span>Nạp tệp JSON đã chuẩn bị offline</span>
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                          Để bảo vệ tài nguyên máy chủ và kiểm soát dữ liệu chặt chẽ, backend tiếp nhận tệp JSON chuẩn hóa từ công cụ offline CLI.
                        </p>
                      </div>

                      {/* File Upload Input */}
                      <div className="p-6 border-2 border-dashed border-slate-200 rounded-2xl text-center space-y-2 bg-slate-50/50">
                        <input
                          type="file"
                          accept=".json,application/json"
                          onChange={handleJsonUpload}
                          className="text-xs text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                        />
                        {jsonFileName && (
                          <div className="text-xs font-semibold text-slate-700">
                            Đã nạp: <strong>{jsonFileName}</strong>
                          </div>
                        )}
                      </div>

                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={handleRunPreview}
                          disabled={!jsonFileContent || previewLoading}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-2xs"
                        >
                          {previewLoading ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                          <span>Kiểm tra & Xem trước (Preview)</span>
                        </button>
                      </div>
                    </div>

                    {/* Preview Result Card */}
                    {previewResult && (
                      <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-4 animate-fadeIn">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">

                            <span>Kết quả kiểm tra tệp: {previewResult.valid ? 'HỢP LỆ' : 'CÓ LỖI'}</span>
                          </h4>

                          {previewResult.valid && (
                            <button
                              type="button"
                              onClick={handleApplyBatch}
                              disabled={actionLoading}
                              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-xs"
                            >
                              {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                              <span>Apply Batch này</span>
                            </button>
                          )}
                        </div>

                        {/* Metrics Bar */}
                        <div className="grid grid-cols-3 gap-3 text-center text-xs">
                          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                            <span className="text-slate-400 block text-xs font-semibold uppercase">Tổng dòng</span>
                            <strong className="text-slate-900 text-base">{previewResult.receipt.expectedRows}</strong>
                          </div>
                          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                            <span className="text-emerald-600 block text-xs font-semibold uppercase">Hợp lệ</span>
                            <strong className="text-emerald-800 text-base">{previewResult.receipt.acceptedRows}</strong>
                          </div>
                          <div className="p-3 rounded-xl bg-red-50 border border-red-200">
                            <span className="text-red-600 block text-xs font-semibold uppercase">Từ chối / Lỗi</span>
                            <strong className="text-red-800 text-base">{previewResult.receipt.rejectedRows}</strong>
                          </div>
                        </div>

                        {/* Error List if invalid */}
                        {!previewResult.valid && 'errors' in previewResult && previewResult.errors.length > 0 && (
                          <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-900 space-y-2">
                            <strong className="block text-red-950 font-semibold">Danh sách lỗi dòng ({previewResult.errors.length}):</strong>
                            <div className="max-h-48 overflow-y-auto space-y-1 text-xs">
                              {previewResult.errors.map((e, idx) => (
                                <div key={idx} className="p-1.5 rounded-lg bg-white/70">
                                  Dòng #{e.sourceRowNumber}: {e.code} ({e.field})
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Mapped Rows Preview */}
                        {importRows.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs text-slate-500">
                              <span className="font-semibold">Xem trước 20 dòng đầu tiên đã map:</span>
                              <span className="text-xs">Batch: {previewResult.receipt.batchId.slice(0, 16)}...</span>
                            </div>
                            <div className="overflow-x-auto border border-slate-200 rounded-xl">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                                  <tr>
                                    <th className="p-2">Dòng gốc</th>
                                    <th className="p-2">MSSV</th>
                                    <th className="p-2">Họ tên</th>
                                    <th className="p-2">Loại HB</th>
                                    <th className="p-2">Lớp</th>
                                    <th className="p-2">Điểm map</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {importRows.map((r) => (
                                    <tr key={r.id} className="hover:bg-slate-50">
                                      <td className="p-2 text-slate-400">#{r.sourceRowNumber}</td>
                                      <td className="p-2 font-semibold text-slate-900">{r.studentCode}</td>
                                      <td className="p-2 font-semibold text-slate-900">{r.fullName}</td>
                                      <td className="p-2 text-slate-700">{r.awardType}</td>
                                      <td className="p-2 text-slate-500">{r.className || '—'}</td>
                                      <td className="p-2 text-blue-700 text-xs">
                                        {JSON.stringify(r.scores)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: APPROVAL (PER-FIELD & OFFICIAL SOURCE) */}
                {activeTab === 'approval' && (
                  <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-6">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <span>Phê duyệt thông tin & Quyết định chính thức</span>
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Chỉ những trường và cột điểm được đánh dấu phê duyệt tại đây mới được xuất hiện công khai trên API và giao diện sinh viên.
                      </p>
                    </div>

                    {/* Official Document Inputs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="space-y-1">
                        <label className="font-semibold text-slate-700">Tên quyết định / Nguồn ban hành:</label>
                        <input
                          type="text"
                          aria-label="Tên quyết định"
                          value={approvalTitle}
                          onChange={(e) => setApprovalTitle(e.target.value)}
                          placeholder="VD: Quyết định trao học bổng KKHT HK1 2025-2026"
                          className="w-full p-2.5 rounded-xl border border-slate-200 font-semibold outline-none focus:border-blue-600"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-semibold text-slate-700">Số hiệu văn bản (Reference):</label>
                        <input
                          type="text"
                          aria-label="Số hiệu văn bản"
                          value={approvalRef}
                          onChange={(e) => setApprovalRef(e.target.value)}
                          placeholder="VD: QĐ 1234/QĐ-ĐHNH ngày 15/10/2026"
                          className="w-full p-2.5 rounded-xl border border-slate-200 font-semibold outline-none focus:border-blue-600"
                        />
                      </div>

                      <div className="sm:col-span-2 space-y-1">
                        <label className="font-semibold text-slate-700">Đường dẫn HTTPS văn bản gốc (Tùy chọn):</label>
                        <input
                          type="url"
                          aria-label="Đường dẫn HTTPS văn bản gốc"
                          value={approvalUrl}
                          onChange={(e) => setApprovalUrl(e.target.value)}
                          placeholder="https://hub.edu.vn/van-ban/qd-hoc-bong..."
                          className="w-full p-2.5 rounded-xl border border-slate-200 font-semibold outline-none focus:border-blue-600"
                        />
                      </div>
                    </div>

                    {/* Per-field approval checklist */}
                    <div className="space-y-3 pt-2 border-t border-slate-100 text-xs">
                      <span className="font-semibold text-slate-800 block">Các trường phê duyệt công khai:</span>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-100 opacity-80 cursor-not-allowed">
                          <input type="checkbox" checked disabled className="accent-blue-600" />
                          <span className="font-semibold text-slate-700">fullName (Bắt buộc)</span>
                        </label>
                        <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-100 opacity-80 cursor-not-allowed">
                          <input type="checkbox" checked disabled className="accent-blue-600" />
                          <span className="font-semibold text-slate-700">studentCode (Bắt buộc)</span>
                        </label>
                        <label className="flex items-center gap-2 p-2 rounded-xl bg-slate-100 opacity-80 cursor-not-allowed">
                          <input type="checkbox" checked disabled className="accent-blue-600" />
                          <span className="font-semibold text-slate-700">awardType (Bắt buộc)</span>
                        </label>

                        {/* Optional fields */}
                        {[
                          ...(candidate?.mapping.className ? ['className'] : []),
                          ...(candidate?.mapping.major ? ['major'] : []),
                          ...(['scholarshipType', 'scholarshipRank', 'cohort'] as const).filter(key => candidate?.mapping[key]),
                          ...(candidate?.mapping.scores.map(score => `scores.${score.key}`) || []),
                        ].map((field) => (
                          <label
                            key={field}
                            className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={approvedFields.has(field)}
                              onChange={(e) => {
                                const next = new Set(approvedFields);
                                if (e.target.checked) next.add(field);
                                else next.delete(field);
                                setApprovedFields(next);
                              }}
                              className="accent-blue-600"
                            />
                            <span className="font-semibold text-slate-800">{field}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Republication confirmation */}
                    <div className="pt-2 border-t border-slate-100">
                      <label className="flex items-start gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={republicationConfirmed}
                          onChange={(e) => setRepublicationConfirmed(e.target.checked)}
                          className="accent-blue-600 mt-0.5"
                        />
                        <span>
                          Tôi xác nhận đã kiểm tra văn bản gốc và nhà trường cho phép tái công bố các trường dữ liệu trên (republicationConfirmed: true).
                        </span>
                      </label>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="button"
                        onClick={handleSubmitApproval}
                        disabled={actionLoading || !republicationConfirmed || !candidate || activeCampaign.status !== 'validated'}
                        className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
                      >
                        {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                        <span>Lưu phê duyệt</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* TAB 4: HISTORY & AUDIT */}
                {activeTab === 'history' && (
                  <div className="space-y-6">
                    {/* Batches Import History */}
                    <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-4">
                      <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <span>Lịch sử các đợt nạp (Batches)</span>
                      </h4>

                      {loadingHistory ? (
                        <div className="py-8 text-center text-xs text-slate-500">Đang tải lịch sử...</div>
                      ) : importsHistory.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-400">Chưa có đợt nạp nào.</div>
                      ) : (
                        <div className="space-y-3">
                          {importsHistory.map((imp) => (
                            <div
                              key={imp.batchId}
                              className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-slate-800">
                                  Batch: {imp.batchId.slice(0, 16)}...
                                </span>
                                <span className="font-semibold uppercase text-xs px-2 py-0.5 rounded-md bg-blue-100 text-blue-800">
                                  {imp.status}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-slate-600">
                                <div>Tệp: <strong>{imp.sourceFilename}</strong></div>
                                <div>Dòng hợp lệ: <strong>{imp.acceptedRows}</strong></div>
                                <div>Thời gian: <strong>{imp.createdAt}</strong></div>
                                <div>
                                  {/* Rollback button if campaign is published and this is an approved historical batch */}
                                  {activeCampaign.status === 'published' && imp.batchId !== activeCampaign.activeBatchId && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActionConfirm({
                                          type: 'rollback',
                                          title: 'Xác nhận Rollback về đợt này',
                                          description: `Chiến dịch sẽ khôi phục dữ liệu về đợt nạp ${imp.batchId.slice(0, 12)}...`,
                                          batchId: imp.batchId,
                                        });
                                      }}
                                      className="text-amber-700 font-semibold hover:underline"
                                    >
                                      Rollback về đợt này
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Audit Trail Events */}
                    <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-4">
                      <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                        <span>Nhật ký kiểm toán (Audit Trail)</span>
                      </h4>

                      {auditEvents.length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-400">Chưa có sự kiện nào.</div>
                      ) : (
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                          {auditEvents.map((evt) => (
                            <div
                              key={evt.id}
                              className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between text-xs"
                            >
                              <div className="space-y-0.5">
                                <span className="font-semibold text-slate-800">
                                  Hành động: {evt.action}
                                </span>
                                <div className="text-xs text-slate-400 ">
                                  User: {evt.actorUserId.slice(0, 8)}... • {evt.createdAt}
                                </div>
                              </div>
                              <span className="text-xs text-slate-500 bg-white px-2 py-1 rounded-md border border-slate-200">
                                {JSON.stringify(evt.details)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: CREATE CAMPAIGN */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-4 border border-slate-200 animate-fadeIn">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Tạo chiến dịch học bổng mới</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Mã định danh (slug):</label>
                <input
                  type="text"
                  aria-label="Mã định danh chiến dịch"
                  value={createSlug}
                  onChange={(e) => setCreateSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="VD: hk1-2025-2026"
                  className="w-full p-2.5 rounded-xl border border-slate-200 font-semibold"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Tiêu đề chiến dịch:</label>
                <input
                  type="text"
                  aria-label="Tiêu đề chiến dịch"
                  value={createTitle}
                  onChange={(e) => setCreateTitle(e.target.value)}
                  placeholder="VD: Học bổng Khuyến khích học tập HK1 2025-2026"
                  className="w-full p-2.5 rounded-xl border border-slate-200 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Năm học:</label>
                  <input
                    type="text"
                    aria-label="Năm học chiến dịch"
                    value={createSchoolYear}
                    onChange={(e) => setCreateSchoolYear(e.target.value)}
                    placeholder="2025-2026"
                    className="w-full p-2.5 rounded-xl border border-slate-200 font-semibold"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Học kỳ:</label>
                  <input
                    type="text"
                    aria-label="Học kỳ chiến dịch"
                    value={createSemester}
                    onChange={(e) => setCreateSemester(e.target.value)}
                    placeholder="HK1"
                    className="w-full p-2.5 rounded-xl border border-slate-200 font-semibold"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!createSlug || !createTitle) {
                    alert('Vui lòng điền slug và tiêu đề.');
                    return;
                  }
                  try {
                    await createAdminCampaign({
                      slug: createSlug,
                      title: createTitle,
                      schoolYear: createSchoolYear,
                      semester: createSemester,
                    });
                    setShowCreateModal(false);
                    await loadCampaigns();
                  } catch (err) {
                    alert(err instanceof ScholarshipApiError ? err.message : 'Tạo thất bại.');
                  }
                }}
                className="px-5 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 shadow-sm"
              >
                Tạo chiến dịch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CONFIRMATION DIALOG FOR STATE MUTATIONS (PUBLISH, UNPUBLISH, ROLLBACK, ARCHIVE) */}
      {actionConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl space-y-4 border border-slate-200 animate-fadeIn">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <h3 className="text-base font-semibold text-slate-900">{actionConfirm.title}</h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {actionConfirm.description}
            </p>

            {actionError && (
              <div className="p-3 rounded-xl bg-red-50 text-red-800 text-xs font-semibold">
                {actionError}
              </div>
            )}

            <div className="pt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setActionConfirm(null)}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleExecuteStateAction}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 shadow-sm"
              >
                {actionLoading && <Loader2 size={14} className="animate-spin" />}
                <span>Xác nhận thực hiện</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </ScholarshipShell>
  );
};
