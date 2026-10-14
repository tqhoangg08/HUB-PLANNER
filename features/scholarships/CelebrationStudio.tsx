import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import {
  Award,
  Camera,
  Check,
  ChevronLeft,
  Crown,
  Download,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Layers,
  Lock,
  Move,
  RefreshCw,
  Share2,
  Sliders,
  Sparkles,
  Trophy,
  Upload,
  ZoomIn,
  ZoomOut,
  X,
  FileCheck,
  ShieldCheck,
} from 'lucide-react';
import { ScholarshipShell } from './ScholarshipShell';
import { ConfettiOverlay } from './ConfettiOverlay';
import { useUserRole } from '../../hooks/useUserRole';
import {
  fetchMyScholarships,
  type OwnAward,
  ScholarshipApiError,
} from '../../utils/scholarshipApi';
import { playClick } from '../../utils/audio';
import { refreshedOwnAward } from '../../utils/scholarshipCelebrationModel';

// Template styles
export type TemplateStyle = 'academic-gold' | 'hub-minimal' | 'scholarship-flex' | 'soft-achievement';

// Aspect ratio formats
export type ExportRatio = 'story' | 'feed'; // story: 1080x1920, feed: 1080x1350

// Frame Mask shapes
export type FrameMask = 'circle' | 'arch' | 'rounded-rect' | 'shield';

export const CelebrationStudio: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { session, loading: authLoading } = useUserRole();

  // Awards state
  const [awards, setAwards] = useState<OwnAward[]>([]);
  const [selectedAwardId, setSelectedAwardId] = useState<number | null>(null);
  const [loadingAwards, setLoadingAwards] = useState<boolean>(true);
  const [awardError, setAwardError] = useState<string | null>(null);

  // Template & Customization state
  const [template, setTemplate] = useState<TemplateStyle>('academic-gold');
  const [exportRatio, setExportRatio] = useState<ExportRatio>('story');
  const [frameMask, setFrameMask] = useState<FrameMask>('arch');
  const [showStudentCode, setShowStudentCode] = useState<boolean>(true);
  const [showScores, setShowScores] = useState<boolean>(true);
  const [showClassMajor, setShowClassMajor] = useState<boolean>(true);
  const [customQuote, setCustomQuote] = useState<string>('Nỗ lực hôm nay, tự hào ngày mai.');

  // User Portrait Image state
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState<number>(1.0);
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Preview & Export state
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);
  const [showVictoryReveal, setShowVictoryReveal] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageGeneration = useRef(0);
  const awardRequest = useRef<AbortController | null>(null);
  useEffect(() => () => { imageGeneration.current++; }, []);

  // 1. Load user's verified awards directly from server
  const loadVerifiedAwards = async () => {
    awardRequest.current?.abort();
    const controller = new AbortController();
    awardRequest.current = controller;
    setAwards([]);
    setLoadingAwards(true);
    setAwardError(null);

    try {
      const data = await fetchMyScholarships(controller.signal);
      if (controller.signal.aborted) return;
      if (!data.verified || data.awards.length === 0) {
        setAwardError('Bạn chưa có học bổng đã xác minh để tạo ảnh vinh danh.');
        setAwards([]);
        return;
      }

      setAwards(data.awards);
      const requestedId = searchParams.get('awardId');
      if (requestedId) {
        const found = data.awards.find((a) => a.id === Number(requestedId));
        if (found) {
          setSelectedAwardId(found.id);
        } else {
          setSelectedAwardId(data.awards[0].id);
        }
      } else {
        setSelectedAwardId(data.awards[0].id);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err instanceof ScholarshipApiError && err.status === 401) {
        setAwardError('Vui lòng đăng nhập để truy cập Studio Vinh danh.');
      } else {
        setAwardError('Không thể tải dữ liệu xác minh học bổng.');
      }
    } finally {
      if (!controller.signal.aborted) setLoadingAwards(false);
    }
  };

  useEffect(() => {
    if (!authLoading && session) {
      void loadVerifiedAwards();
    } else if (!authLoading && !session) {
      setAwards([]);
      setAwardError('Vui lòng đăng nhập để truy cập Studio Vinh danh.');
      setLoadingAwards(false);
    }
    return () => awardRequest.current?.abort();
  }, [session, authLoading]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (imageSrc && imageSrc.startsWith('blob:')) {
        URL.revokeObjectURL(imageSrc);
      }
    };
  }, [imageSrc]);

  // Current active award
  const currentAward = awards.find((a) => a.id === selectedAwardId) || awards[0] || null;

  // Handle file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      alert('Vui lòng chọn ảnh định dạng JPG, PNG hoặc WebP.');
      return;
    }

    // Validate size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('Kích thước ảnh tối đa là 10 MB.');
      return;
    }

    const generation = ++imageGeneration.current;
    const objectUrl = URL.createObjectURL(file);
    setImageSrc(objectUrl);
    setImageElement(null);
    e.target.value = '';

    const img = new Image();
    img.onload = () => {
      if (generation !== imageGeneration.current) return;
      setImageElement(img);
      setZoom(1.0);
      setPanX(0);
      setPanY(0);
    };
    img.onerror = () => { if (generation === imageGeneration.current) { setImageSrc(null); alert('Không thể đọc ảnh đã chọn.'); } };
    img.src = objectUrl;
  };

  // Dragging handlers for portrait panning
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imageElement) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPanX(e.clientX - dragStart.x);
    setPanY(e.clientY - dragStart.y);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!imageElement || e.touches.length === 0) return;
    setIsDragging(true);
    setDragStart({ x: e.touches[0].clientX - panX, y: e.touches[0].clientY - panY });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length === 0) return;
    setPanX(e.touches[0].clientX - dragStart.x);
    setPanY(e.touches[0].clientY - dragStart.y);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // RENDER CANVAS LOGIC (Pure client-side Canvas rendering at exact resolution: 1080x1920 or 1080x1350)
  const drawCelebrationCard = useCallback(
    (canvas: HTMLCanvasElement, targetWidth: number, targetHeight: number, verifiedAward = currentAward) => {
      const ctx = canvas.getContext('2d');
      if (!ctx || !verifiedAward) return;

      canvas.width = targetWidth;
      canvas.height = targetHeight;

      // 1. Draw Background based on template
      if (template === 'academic-gold') {
        // Deep Navy Gradient with gold accents
        const bgGrad = ctx.createLinearGradient(0, 0, targetWidth, targetHeight);
        bgGrad.addColorStop(0, '#001A3D');
        bgGrad.addColorStop(0.5, '#002654');
        bgGrad.addColorStop(1, '#001026');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, targetWidth, targetHeight);

        // Elegant Guilloche / Border Frame
        ctx.strokeStyle = '#D4AF37';
        ctx.lineWidth = 4;
        ctx.strokeRect(40, 40, targetWidth - 80, targetHeight - 80);

        ctx.strokeStyle = '#F3E5AB';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(50, 50, targetWidth - 100, targetHeight - 100);

        // Corner ornaments
        const cornerSize = 30;
        const corners = [
          [55, 55],
          [targetWidth - 55, 55],
          [55, targetHeight - 55],
          [targetWidth - 55, targetHeight - 55],
        ];
        ctx.fillStyle = '#D4AF37';
        corners.forEach(([cx, cy]) => {
          ctx.beginPath();
          ctx.arc(cx, cy, 6, 0, Math.PI * 2);
          ctx.fill();
        });
      } else if (template === 'hub-minimal') {
        // Modern Crisp Slate/White background with geometric lines
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, targetWidth, targetHeight);

        // Geometric accent top bar
        const barGrad = ctx.createLinearGradient(0, 0, targetWidth, 0);
        barGrad.addColorStop(0, '#003375');
        barGrad.addColorStop(1, '#0052CC');
        ctx.fillStyle = barGrad;
        ctx.fillRect(0, 0, targetWidth, 24);

        // Clean border
        ctx.strokeStyle = '#E2E8F0';
        ctx.lineWidth = 3;
        ctx.strokeRect(40, 48, targetWidth - 80, targetHeight - 88);
      } else if (template === 'scholarship-flex') {
        // Vibrant Royal Blue with bold glow
        const flexGrad = ctx.createLinearGradient(0, 0, targetWidth, targetHeight);
        flexGrad.addColorStop(0, '#0A3B99');
        flexGrad.addColorStop(0.6, '#1A56FF');
        flexGrad.addColorStop(1, '#052266');
        ctx.fillStyle = flexGrad;
        ctx.fillRect(0, 0, targetWidth, targetHeight);

        // Radial glow center
        const glow = ctx.createRadialGradient(
          targetWidth / 2,
          targetHeight * 0.4,
          50,
          targetWidth / 2,
          targetHeight * 0.4,
          targetWidth * 0.7,
        );
        glow.addColorStop(0, 'rgba(255, 215, 0, 0.22)');
        glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, targetWidth, targetHeight);

        // Border
        ctx.strokeStyle = '#FFDF00';
        ctx.lineWidth = 5;
        ctx.strokeRect(36, 36, targetWidth - 72, targetHeight - 72);
      } else {
        // Soft Achievement: Champagne Cream / Blush
        const softGrad = ctx.createLinearGradient(0, 0, targetWidth, targetHeight);
        softGrad.addColorStop(0, '#FAF7F2');
        softGrad.addColorStop(0.5, '#F5EDE2');
        softGrad.addColorStop(1, '#EDE2D3');
        ctx.fillStyle = softGrad;
        ctx.fillRect(0, 0, targetWidth, targetHeight);

        // Warm Gold Border
        ctx.strokeStyle = '#C5A059';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(40, 40, targetWidth - 80, targetHeight - 80);
      }

      // 2. Draw Top Branding & Season Badge
      const isDark = template === 'academic-gold' || template === 'scholarship-flex';

      ctx.textAlign = 'center';
      ctx.fillStyle = isDark ? '#F3E5AB' : '#003375';
      ctx.font = 'bold 28px sans-serif';
      ctx.letterSpacing = '6px';
      ctx.fillText('TRƯỜNG ĐẠI HỌC NGÂN HÀNG TP. HỒ CHÍ MINH', targetWidth / 2, 110);

      ctx.font = 'bold 36px sans-serif';
      ctx.fillStyle = isDark ? '#FFFFFF' : '#0A2540';
      ctx.letterSpacing = '3px';
      ctx.fillText('HUB SCHOLARSHIP SEASON', targetWidth / 2, 160);

      // Subtitle: Campaign Name & Semester
      ctx.font = '500 24px sans-serif';
      ctx.fillStyle = isDark ? '#CBD5E1' : '#64748B';
      ctx.letterSpacing = '1px';
      const semesterText = `${verifiedAward.campaignTitle} • ${verifiedAward.semester} (${verifiedAward.schoolYear})`;
      ctx.fillText(semesterText, targetWidth / 2, 200);

      // 3. User Portrait Frame & Image
      const isStory = targetHeight === 1920;
      const portraitY = isStory ? 600 : 500;
      const portraitW = isStory ? 540 : 480;
      const portraitH = isStory ? 620 : 520;
      const portraitX = (targetWidth - portraitW) / 2;

      ctx.save();

      // Create clipping mask
      ctx.beginPath();
      if (frameMask === 'circle') {
        const radius = Math.min(portraitW, portraitH) / 2;
        ctx.arc(targetWidth / 2, portraitY, radius, 0, Math.PI * 2);
      } else if (frameMask === 'arch') {
        const topRadius = portraitW / 2;
        ctx.moveTo(portraitX, portraitY + portraitH / 2);
        ctx.lineTo(portraitX, portraitY - portraitH / 2 + topRadius);
        ctx.arc(targetWidth / 2, portraitY - portraitH / 2 + topRadius, topRadius, Math.PI, 0);
        ctx.lineTo(portraitX + portraitW, portraitY + portraitH / 2);
        ctx.closePath();
      } else if (frameMask === 'shield') {
        const cx = targetWidth / 2;
        const cy = portraitY;
        const w2 = portraitW / 2;
        const h2 = portraitH / 2;
        ctx.moveTo(cx - w2, cy - h2);
        ctx.lineTo(cx + w2, cy - h2);
        ctx.lineTo(cx + w2, cy + h2 * 0.4);
        ctx.quadraticCurveTo(cx + w2, cy + h2, cx, cy + h2);
        ctx.quadraticCurveTo(cx - w2, cy + h2, cx - w2, cy + h2 * 0.4);
        ctx.closePath();
      } else {
        // Rounded Rect
        const r = 32;
        const x = portraitX;
        const y = portraitY - portraitH / 2;
        ctx.roundRect(x, y, portraitW, portraitH, r);
      }
      ctx.clip();

      // Draw portrait background (placeholder if no image)
      ctx.fillStyle = isDark ? '#0F264A' : '#E2E8F0';
      ctx.fillRect(portraitX, portraitY - portraitH / 2, portraitW, portraitH);

      // Draw uploaded user photo if present
      if (imageElement) {
        const baseScale = Math.max(portraitW / imageElement.width, portraitH / imageElement.height);
        const finalScale = baseScale * zoom;
        const drawW = imageElement.width * finalScale;
        const drawH = imageElement.height * finalScale;
        const drawX = targetWidth / 2 - drawW / 2 + panX;
        const drawY = portraitY - drawH / 2 + panY;

        ctx.drawImage(imageElement, drawX, drawY, drawW, drawH);
      } else {
        // Silhouette placeholder
        ctx.fillStyle = isDark ? '#1E3A8A' : '#CBD5E1';
        ctx.textAlign = 'center';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText('Chưa tải ảnh chân dung', targetWidth / 2, portraitY);
      }
      ctx.restore();

      // Draw frame outline
      ctx.save();
      ctx.strokeStyle = template === 'academic-gold' ? '#D4AF37' : template === 'scholarship-flex' ? '#FFDF00' : '#003375';
      ctx.lineWidth = 6;
      ctx.beginPath();
      if (frameMask === 'circle') {
        const radius = Math.min(portraitW, portraitH) / 2;
        ctx.arc(targetWidth / 2, portraitY, radius, 0, Math.PI * 2);
      } else if (frameMask === 'arch') {
        const topRadius = portraitW / 2;
        ctx.moveTo(portraitX, portraitY + portraitH / 2);
        ctx.lineTo(portraitX, portraitY - portraitH / 2 + topRadius);
        ctx.arc(targetWidth / 2, portraitY - portraitH / 2 + topRadius, topRadius, Math.PI, 0);
        ctx.lineTo(portraitX + portraitW, portraitY + portraitH / 2);
        ctx.closePath();
      } else if (frameMask === 'shield') {
        const cx = targetWidth / 2;
        const cy = portraitY;
        const w2 = portraitW / 2;
        const h2 = portraitH / 2;
        ctx.moveTo(cx - w2, cy - h2);
        ctx.lineTo(cx + w2, cy - h2);
        ctx.lineTo(cx + w2, cy + h2 * 0.4);
        ctx.quadraticCurveTo(cx + w2, cy + h2, cx, cy + h2);
        ctx.quadraticCurveTo(cx - w2, cy + h2, cx - w2, cy + h2 * 0.4);
        ctx.closePath();
      } else {
        const r = 32;
        const x = portraitX;
        const y = portraitY - portraitH / 2;
        ctx.roundRect(x, y, portraitW, portraitH, r);
      }
      ctx.stroke();
      ctx.restore();

      // 4. Award Badge Pill (centered right below portrait)
      const badgeY = isStory ? portraitY + portraitH / 2 + 70 : portraitY + portraitH / 2 + 55;
      const awardTypeUpper = verifiedAward.awardType.toUpperCase();

      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold 30px sans-serif';
      const textWidth = ctx.measureText(awardTypeUpper).width;
      const pillW = textWidth + 80;
      const pillH = 56;

      const pillGrad = ctx.createLinearGradient(
        targetWidth / 2 - pillW / 2,
        badgeY - pillH / 2,
        targetWidth / 2 + pillW / 2,
        badgeY + pillH / 2,
      );
      pillGrad.addColorStop(0, '#D4AF37');
      pillGrad.addColorStop(0.5, '#F9E79F');
      pillGrad.addColorStop(1, '#B7950B');
      ctx.fillStyle = pillGrad;
      ctx.beginPath();
      ctx.roundRect(targetWidth / 2 - pillW / 2, badgeY - pillH / 2, pillW, pillH, 28);
      ctx.fill();

      ctx.fillStyle = '#3E2723';
      ctx.fillText(`★  HỌC BỔNG ${awardTypeUpper}  ★`, targetWidth / 2, badgeY + 10);
      ctx.restore();

      // 5. Student Verified Name (LARGE, IMMUTABLE)
      const nameY = badgeY + 80;
      ctx.textAlign = 'center';
      ctx.font = '900 58px sans-serif';
      ctx.fillStyle = isDark ? '#FFFFFF' : '#0A2540';
      ctx.letterSpacing = '1px';
      ctx.fillText(verifiedAward.fullName.toUpperCase(), targetWidth / 2, nameY);

      // 6. Student Code & Class / Major
      let metaY = nameY + 50;
      ctx.font = 'bold 26px sans-serif';
      ctx.fillStyle = isDark ? '#94A3B8' : '#475569';

      const metaParts: string[] = [];
      if (showStudentCode) metaParts.push(`MSSV: ${verifiedAward.studentCode}`);
      if (showClassMajor && verifiedAward.className) metaParts.push(`Lớp: ${verifiedAward.className}`);
      if (showClassMajor && verifiedAward.major) metaParts.push(`${verifiedAward.major}`);

      if (metaParts.length > 0) {
        ctx.fillText(metaParts.join('  •  '), targetWidth / 2, metaY);
        metaY += 45;
      }

      // 7. Approved Scores (if enabled and scores exist)
      if (showScores && verifiedAward.scores && Object.keys(verifiedAward.scores).length > 0) {
        const scoreParts = Object.entries(verifiedAward.scores)
          .filter(([, v]) => v !== null && v !== undefined)
          .map(([k, v]) => `${k.toUpperCase()}: ${v}`);

        if (scoreParts.length > 0) {
          ctx.save();
          ctx.font = 'bold 24px monospace';
          ctx.fillStyle = isDark ? '#38BDF8' : '#0052CC';
          ctx.fillText(`[ ${scoreParts.join('  |  ')} ]`, targetWidth / 2, metaY);
          ctx.restore();
          metaY += 55;
        }
      }

      // 8. Custom Quote / Reflection
      if (customQuote.trim()) {
        ctx.save();
        ctx.font = 'italic 26px serif';
        ctx.fillStyle = isDark ? '#F1F5F9' : '#334155';
        ctx.fillText(`"${customQuote.trim()}"`, targetWidth / 2, metaY + 15);
        ctx.restore();
      }

      // 9. Official School Provenance Seal at Bottom
      const footerY = targetHeight - 80;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '600 20px sans-serif';
      ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.45)';
      ctx.fillText(
        `Xác thực theo quyết định: ${verifiedAward.campaignTitle} • HUB Planner`,
        targetWidth / 2,
        footerY,
      );
      ctx.restore();
    },
    [
      currentAward,
      template,
      frameMask,
      imageElement,
      zoom,
      panX,
      panY,
      showStudentCode,
      showClassMajor,
      showScores,
      customQuote,
    ],
  );

  // Trigger preview canvas update
  useEffect(() => {
    const previewCanvas = previewCanvasRef.current;
    if (!previewCanvas) return;

    const width = 1080;
    const height = exportRatio === 'story' ? 1920 : 1350;

    drawCelebrationCard(previewCanvas, width, height);
  }, [drawCelebrationCard, exportRatio]);

  // Export High-Res PNG download
  const handleExportPNG = async () => {
    if (!currentAward) return;
    setIsExporting(true);
    setExportSuccessMessage(null);
    playClick();

    try {
      // Re-verify scholarship records before generating export
      const recheck = await fetchMyScholarships();
      const freshAward = refreshedOwnAward(recheck, currentAward);
      if (!freshAward) {
        setAwards([]); setAwardError('Học bổng không còn được công bố hoặc phiên xác minh đã thay đổi.');
        alert('Không thể xác minh học bổng hoặc phiên làm việc đã thay đổi. Vui lòng kiểm tra lại từ trang Học bổng của tôi.');
        setIsExporting(false);
        return;
      }

      const exportCanvas = document.createElement('canvas');
      const targetW = 1080;
      const targetH = exportRatio === 'story' ? 1920 : 1350;

      drawCelebrationCard(exportCanvas, targetW, targetH, freshAward);

      exportCanvas.toBlob((blob) => {
        if (!blob) {
          alert('Không thể tạo tệp ảnh.');
          setIsExporting(false);
          return;
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const fileName = `HUB-Scholarship-${currentAward.studentCode}-${exportRatio}.png`;
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setIsExporting(false);
        setExportSuccessMessage(`Đã xuất ảnh thành công (${targetW}×${targetH}px)!`);
        setShowVictoryReveal(true);
      }, 'image/png');
    } catch (err) {
      console.error('Export error:', err);
      alert('Đã xảy ra lỗi khi tạo ảnh vinh danh.');
      setIsExporting(false);
    }
  };

  // Web Share API
  const handleShare = async () => {
    if (!currentAward) return;
    setIsExporting(true);

    try {
      // Re-verify scholarship records before sharing
      const recheck = await fetchMyScholarships();
      const freshAward = refreshedOwnAward(recheck, currentAward);
      if (!freshAward) {
        setAwards([]); setAwardError('Học bổng không còn được công bố hoặc phiên xác minh đã thay đổi.');
        alert('Không thể xác minh học bổng hoặc phiên làm việc đã thay đổi. Vui lòng kiểm tra lại từ trang Học bổng của tôi.');
        setIsExporting(false);
        return;
      }

      const exportCanvas = document.createElement('canvas');
      const targetW = 1080;
      const targetH = exportRatio === 'story' ? 1920 : 1350;

      drawCelebrationCard(exportCanvas, targetW, targetH, freshAward);

      exportCanvas.toBlob(async (blob) => {
        if (!blob) {
          setIsExporting(false);
          return;
        }

        const fileName = `HUB-Scholarship-${currentAward.studentCode}-${exportRatio}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: 'Thành tích Học bổng HUB',
              text: `Tôi vừa đạt học bổng ${currentAward.awardType} tại HUB Planner!`,
              files: [file],
            });
            setShowVictoryReveal(true);
          } catch {
            // User cancelled share
          }
        } else {
          // Fallback to direct download
          handleExportPNG();
        }
        setIsExporting(false);
      }, 'image/png');
    } catch {
      setIsExporting(false);
    }
  };

  return (
    <ScholarshipShell
      title="Studio Vinh danh"
      subtitle="Thiết kế và tải ảnh vinh danh học bổng cá nhân độ phân giải cao."
    >
      {showVictoryReveal && <ConfettiOverlay onClose={() => setShowVictoryReveal(false)} />}

      {/* Loading verified awards */}
      {loadingAwards && (
        <div className="py-24 text-center flex flex-col items-center justify-center gap-3">
          <p className="text-xs font-semibold text-slate-600">Đang tải và kiểm chứng dữ liệu vinh danh của bạn...</p>
        </div>
      )}

      {/* Auth or Eligibility Error */}
      {!loadingAwards && awardError && (
        <div className="max-w-md mx-auto my-12 p-8 rounded-3xl bg-white border border-slate-200 text-center space-y-4 shadow-sm">
          <h2 className="text-xl font-semibold text-[#003375]">Xác minh học bổng cá nhân</h2>
          <p className="text-xs text-slate-600 leading-relaxed">{awardError}</p>
          <div className="pt-2">
            <Link
              to="/scholarships/me"
              onClick={playClick}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0052CC] text-white text-xs font-semibold hover:bg-[#0040a8] transition-colors"
            >
              <span>Xem học bổng của tôi</span>
              <ChevronLeft size={16} className="rotate-180" />
            </Link>
          </div>
        </div>
      )}

      {/* Main Studio Editor */}
      {!loadingAwards && !awardError && currentAward && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-fadeIn">
          {/* LEFT COLUMN: Controls & Customization Panel (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Award Selector if user has multiple awards */}
            {awards.length > 1 && (
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-2">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Award size={15} className="text-[#0052CC]" />
                  <span>Chọn giải thưởng vinh danh:</span>
                </label>
                <select
                  aria-label="Chọn giải thưởng vinh danh"
                  value={selectedAwardId || ''}
                  onChange={(e) => setSelectedAwardId(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900 rounded-xl p-2.5 outline-none focus:ring-1 focus:ring-[#0052CC]"
                >
                  {awards.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.awardType} — {a.campaignTitle} ({a.semester})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Locked Verified Identity Notice */}
            <div className="p-4 rounded-2xl bg-white border border-slate-200 text-slate-700 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div>
                  <div className="font-semibold text-slate-900">
                    {currentAward.fullName} — #{currentAward.studentCode}
                  </div>
                  <div className="text-xs text-slate-600">
                    Học bổng: <strong>{currentAward.awardType}</strong> (Đã xác thực chính chủ)
                  </div>
                </div>
              </div>
            </div>

            {/* 1. Upload & Position Portrait */}
            <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <span>Ảnh chân dung cá nhân</span>
                </h3>
                {imageElement && (
                  <button
                    type="button"
                    onClick={() => {
                      setImageSrc(null);
                      setImageElement(null);
                    }}
                    className="text-xs font-semibold text-red-600 hover:underline"
                  >
                    Xóa ảnh
                  </button>
                )}
              </div>

              {/* Upload Dropzone */}
              <input
                ref={fileInputRef}
                aria-label="Ảnh chân dung cá nhân"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />

              {!imageElement ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-8 border-2 border-dashed border-slate-200 hover:border-[#0052CC] rounded-2xl flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-[#0052CC] transition-colors bg-slate-50/50 hover:bg-blue-50/30 cursor-pointer"
                >
                  <Upload size={24} />
                  <span className="text-xs font-semibold">Tải ảnh chân dung từ máy tính hoặc điện thoại</span>
                  <span className="text-xs text-slate-400">Định dạng JPG, PNG, WebP (Tối đa 10 MB)</span>
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="font-semibold flex items-center gap-1">
                      <Sliders size={13} />
                      <span>Thu phóng & Căn chỉnh ảnh:</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="text-xs font-semibold text-[#0052CC] hover:underline"
                    >
                      Đổi ảnh khác
                    </button>
                  </div>

                  {/* Zoom Slider */}
                  <div className="flex items-center gap-3">
                    <ZoomOut size={16} className="text-slate-400" />
                    <input
                      type="range"
                      aria-label="Thu phóng ảnh chân dung"
                      min={0.5}
                      max={3.0}
                      step={0.05}
                      value={zoom}
                      onChange={(e) => setZoom(Number(e.target.value))}
                      className="w-full accent-[#0052CC] cursor-pointer"
                    />
                    <ZoomIn size={16} className="text-slate-400" />
                  </div>

                  <p className="text-xs text-slate-400 italic">
                    * Bạn có thể kéo trực tiếp vào khung ảnh bên phải để điều chỉnh góc mặt.
                  </p>
                </div>
              )}
            </div>

            {/* 2. Template Style Selector (4 Styles) */}
            <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <span>Phong cách thiệp vinh danh</span>
              </h3>

              <div className="grid grid-cols-2 gap-2.5">
                {[
                  {
                    id: 'academic-gold',
                    name: 'Academic Gold',
                    desc: 'Sang trọng, quyền uy',
                    bg: 'bg-white text-slate-900',
                  },
                  {
                    id: 'hub-minimal',
                    name: 'HUB Minimal',
                    desc: 'Hiện đại, thanh lịch',
                    bg: 'bg-white text-slate-900 border border-slate-200',
                  },
                  {
                    id: 'scholarship-flex',
                    name: 'Scholarship Flex',
                    desc: 'Trẻ trung, nổi bật',
                    bg: 'bg-white text-slate-900',
                  },
                  {
                    id: 'soft-achievement',
                    name: 'Soft Achievement',
                    desc: 'Nhẹ nhàng, tinh tế',
                    bg: 'bg-white text-slate-900',
                  },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setTemplate(item.id as TemplateStyle);
                      playClick();
                    }}
                    className={`p-3 rounded-2xl text-left transition-all border-2 ${
                      template === item.id
                        ? 'border-[#0052CC] ring-2 ring-blue-100 shadow-sm'
                        : 'border-transparent hover:border-slate-200'
                    } ${item.bg}`}
                  >
                    <div className="text-xs font-semibold leading-tight">{item.name}</div>
                    <div className="text-xs opacity-80 mt-1">{item.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Frame Mask & Aspect Ratio */}
            <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Tỷ lệ xuất ảnh:</span>
                <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setExportRatio('story')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      exportRatio === 'story'
                        ? 'bg-white text-[#003375] shadow-xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    Story (9:16)
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportRatio('feed')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      exportRatio === 'feed'
                        ? 'bg-white text-[#003375] shadow-xs'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    Feed (4:5)
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-xs font-semibold text-slate-700">Khung ảnh:</span>
                <div className="flex gap-1.5">
                  {(['arch', 'circle', 'rounded-rect', 'shield'] as FrameMask[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setFrameMask(m)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize border ${
                        frameMask === m
                          ? 'border-[#0052CC] bg-blue-50 text-[#0052CC] font-semibold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {m === 'arch' ? 'Vòm' : m === 'circle' ? 'Tròn' : m === 'shield' ? 'Khiên' : 'Bo góc'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 4. Display Toggles & Custom Quote */}
            <div className="p-5 rounded-3xl bg-white border border-slate-200 shadow-xs space-y-3">
              <span className="text-xs font-semibold text-slate-700 block">Tùy chọn hiển thị chi tiết:</span>

              <div className="space-y-2 text-xs">
                <label className="flex items-center justify-between p-2 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer">
                  <span className="font-semibold text-slate-700">Hiện mã số sinh viên (MSSV)</span>
                  <input
                    type="checkbox"
                    checked={showStudentCode}
                    onChange={(e) => setShowStudentCode(e.target.checked)}
                    className="accent-[#0052CC] h-4 w-4"
                  />
                </label>

                <label className="flex items-center justify-between p-2 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer">
                  <span className="font-semibold text-slate-700">Hiện Lớp & Ngành học</span>
                  <input
                    type="checkbox"
                    checked={showClassMajor}
                    onChange={(e) => setShowClassMajor(e.target.checked)}
                    className="accent-[#0052CC] h-4 w-4"
                  />
                </label>

                {currentAward.scores && Object.keys(currentAward.scores).length > 0 && (
                  <label className="flex items-center justify-between p-2 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer">
                    <span className="font-semibold text-slate-700">Hiện điểm số đã phê duyệt</span>
                    <input
                      type="checkbox"
                      checked={showScores}
                      onChange={(e) => setShowScores(e.target.checked)}
                      className="accent-[#0052CC] h-4 w-4"
                    />
                  </label>
                )}
              </div>

              {/* Personal Quote Input */}
              <div className="pt-2">
                <label className="text-xs font-semibold text-slate-500 uppercase block mb-1">
                  Châm ngôn / Lời tri ân cá nhân (Tùy chọn):
                </label>
                <input
                  type="text"
                  aria-label="Châm ngôn hoặc lời tri ân cá nhân"
                  maxLength={60}
                  value={customQuote}
                  onChange={(e) => setCustomQuote(e.target.value)}
                  placeholder="Nhập châm ngôn ngắn (tối đa 60 ký tự)..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 outline-none focus:border-[#0052CC]"
                />
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Live Interactive Preview & Export (7 cols) */}
          <div className="lg:col-span-7 space-y-4 lg:sticky lg:top-24">
            {/* Canvas Preview Container */}
            <div className="p-4 sm:p-6 rounded-3xl bg-white border border-slate-200 flex flex-col items-center justify-center">
              <div className="text-xs font-semibold text-slate-400 mb-3 flex items-center gap-2">
                <Eye size={15} />
                <span>Xem trước trực tiếp (Live Preview)</span>
                <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                  {exportRatio === 'story' ? '1080 × 1920 px' : '1080 × 1350 px'}
                </span>
              </div>

              {/* Interactive Canvas Canvas Viewport */}
              <div
                className="relative overflow-hidden rounded-2xl shadow-2xl cursor-grab active:cursor-grabbing border border-white/10"
                style={{
                  maxWidth: '100%',
                  height: exportRatio === 'story' ? '560px' : '460px',
                  aspectRatio: exportRatio === 'story' ? '9/16' : '4/5',
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                <canvas
                  ref={previewCanvasRef}
                  className="w-full h-full object-contain pointer-events-none"
                />

                {imageElement && isDragging && (
                  <div className="absolute inset-0 bg-blue-500/10 pointer-events-none flex items-center justify-center text-white text-xs font-semibold backdrop-blur-xs">
                    <Move size={24} className="animate-pulse" />
                  </div>
                )}
              </div>

              {/* Action Buttons: Export PNG & Share */}
              <div className="w-full max-w-md mt-6 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleExportPNG}
                  disabled={isExporting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-[#2563eb] text-white font-semibold text-xs hover:brightness-105 active:scale-95 transition-all shadow-md disabled:opacity-50"
                >
                  <Download size={16} />
                  <span>{isExporting ? 'Đang tạo ảnh...' : 'Tải ảnh PNG (HD)'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleShare}
                  disabled={isExporting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-white hover:bg-slate-50 text-slate-700 font-medium text-xs transition-colors border border-slate-300 disabled:opacity-50"
                >
                  <Share2 size={16} />
                  <span>Chia sẻ ngay</span>
                </button>
              </div>

              {exportSuccessMessage && (
                <p className="mt-3 text-xs font-semibold text-emerald-700 animate-fadeIn">
                  ✓ {exportSuccessMessage}
                </p>
              )}

              <p className="mt-4 text-xs text-slate-500 text-center max-w-sm">
                Toàn bộ ảnh được vẽ cục bộ trong bộ nhớ trình duyệt (Canvas). Không có dữ liệu hình ảnh nào được lưu trữ hay tải lên máy chủ.
              </p>
            </div>
          </div>
        </div>
      )}
    </ScholarshipShell>
  );
};
