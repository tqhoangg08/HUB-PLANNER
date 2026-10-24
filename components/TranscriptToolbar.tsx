import { useEffect, useId, useLayoutEffect, useRef, useState, type Ref } from 'react';
import { Check, FileUp, Flag, Loader2, MoreHorizontal, Pencil, Printer, X } from 'lucide-react';
import './transcript-toolbar.css';

type Props = {
    hasSubjects: boolean;
    editable: boolean;
    editing: boolean;
    saving: boolean;
    importing: boolean;
    primaryRef: Ref<HTMLButtonElement>;
    onEdit: () => void;
    onSave: () => void;
    onCancel: () => void;
    onImport: () => void;
    onPrint: () => void;
    onReport: () => void;
};

/** Presentation only: all mutations, PDF flows and permissions stay in Dashboard. */
export function TranscriptToolbar(props: Props) {
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const trigger = useRef<HTMLButtonElement>(null);
    const menu = useRef<HTMLDivElement>(null);
    const menuId = useId();
    const [menuLayout, setMenuLayout] = useState({ up: false, maxHeight: 300 });
    const importPrimary = props.editable && !props.editing && !props.hasSubjects;
    const close = (restoreFocus = false) => {
        setOpen(false);
        if (restoreFocus) trigger.current?.focus({ preventScroll: true });
    };

    useLayoutEffect(() => {
        if (!open) return;
        const measure = () => {
            if (!root.current || !menu.current) return;
            const viewport = window.visualViewport;
            const rect = root.current.getBoundingClientRect();
            let top = viewport?.offsetTop || 0;
            const header = document.querySelector<HTMLElement>('.mobile-browser-header');
            if (header && /fixed|sticky/.test(getComputedStyle(header).position)) top = Math.max(top, header.getBoundingClientRect().bottom);
            const bottom = (viewport?.offsetTop || 0) + (viewport?.height || innerHeight);
            const below = bottom - rect.bottom - 16, above = rect.top - top - 16;
            const up = below < menu.current.scrollHeight && above > below;
            setMenuLayout({ up, maxHeight: Math.max(44, up ? above : below) });
        };
        measure();
        window.addEventListener('resize', measure);
        window.visualViewport?.addEventListener('resize', measure);
        return () => {
            window.removeEventListener('resize', measure);
            window.visualViewport?.removeEventListener('resize', measure);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        [...(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])]
            .find(item => item.getClientRects().length)?.focus({ preventScroll: true });
        const outside = (event: PointerEvent) => {
            if (!root.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', outside);
        return () => document.removeEventListener('pointerdown', outside);
    }, [open]);

    const action = (callback: () => void) => () => {
        close(true);
        callback();
    };
    return <div className="transcript-toolbar" data-transcript-toolbar>
        <h2 className="transcript-toolbar__title">Chi tiết bảng điểm</h2>
        <div className="transcript-toolbar__actions">
            {!importPrimary && <button type="button" className="transcript-toolbar__button transcript-toolbar__desktop" onClick={props.onImport} disabled={props.importing} aria-label="Nhập bảng điểm">
                <span className="transcript-toolbar__surface">{props.importing ? <Loader2 className="animate-spin" /> : <FileUp />}<span>Nhập</span></span>
            </button>}
            <button type="button" className="transcript-toolbar__button transcript-toolbar__desktop" onClick={props.onPrint} aria-label="In bảng điểm"><span className="transcript-toolbar__surface"><Printer /><span>In</span></span></button>
            {props.editable && <button type="button" ref={props.primaryRef} className="transcript-toolbar__button transcript-toolbar__primary" disabled={props.saving || (importPrimary && props.importing)} onClick={props.editing ? props.onSave : importPrimary ? props.onImport : props.onEdit}>
                <span className="transcript-toolbar__surface">{props.saving || (importPrimary && props.importing) ? <Loader2 className="animate-spin" /> : props.editing ? <Check /> : importPrimary ? <FileUp /> : <Pencil />}
                <span>{props.saving ? 'Đang lưu…' : props.editing ? 'Lưu' : importPrimary ? 'Nhập bảng điểm' : 'Chỉnh sửa'}</span></span>
            </button>}
            <div className="transcript-toolbar__overflow" ref={root} onBlur={event => {
                // Safari can blur to body before dispatching a menu item's click.
                // Pointer dismissal is owned by the outside listener instead.
                if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
            }} onKeyDown={event => {
                if (!open) return;
                if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    close(true);
                } else if (event.key === 'Tab') {
                    // Let the browser continue from the trigger, instead of
                    // unmounting the newly focused menu item on the next frame.
                    close(true);
                } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                    event.preventDefault();
                    const items = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])].filter(e => e.getClientRects().length);
                    const index = items.indexOf(document.activeElement as HTMLButtonElement);
                    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
                    items[next]?.focus({ preventScroll: true });
                }
            }}>
                <button type="button" className="transcript-toolbar__button transcript-toolbar__more" ref={trigger} aria-label="Thao tác bảng điểm" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen(value => !value)} onKeyDown={event => {
                    if (!open && ['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true); }
                }}><span className="transcript-toolbar__surface"><MoreHorizontal /></span></button>
                {open && <div className="transcript-toolbar__menu" data-up={menuLayout.up} style={{ maxHeight: menuLayout.maxHeight }} id={menuId} role="menu" aria-label="Thao tác bảng điểm" ref={menu}>
                    {!importPrimary && <button type="button" role="menuitem" className="transcript-toolbar__mobile-item" disabled={props.importing} onClick={action(props.onImport)}><FileUp />Nhập bảng điểm</button>}
                    <button type="button" role="menuitem" className="transcript-toolbar__mobile-item" onClick={action(props.onPrint)}><Printer />In bảng điểm</button>
                    {importPrimary && <button type="button" role="menuitem" onClick={action(props.onEdit)}><Pencil />Chỉnh sửa thủ công</button>}
                    {props.editable && props.editing && <button type="button" role="menuitem" disabled={props.saving} onClick={action(props.onCancel)}><X />Hủy chỉnh sửa</button>}
                    <button type="button" role="menuitem" className="transcript-toolbar__report" onClick={action(props.onReport)}><Flag />Báo lỗi</button>
                </div>}
            </div>
        </div>
    </div>;
}
