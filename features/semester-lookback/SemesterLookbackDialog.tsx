import { useEffect } from 'react';
import type { UserData } from '../../types';
import { SemesterLookbackModal } from '../../components/SemesterLookbackModal';
import { useSemesterLookback } from '../../hooks/useSemesterLookback';

interface SemesterLookbackDialogProps {
    data: UserData;
    onClose: () => void;
}

export const SemesterLookbackDialog = ({ data, onClose }: SemesterLookbackDialogProps) => {
    const lookback = useSemesterLookback(data, true);

    useEffect(() => {
        lookback.open();
    }, [lookback.open]);

    const handleClose = () => {
        lookback.close();
        onClose();
    };

    return (
        <SemesterLookbackModal
            isOpen={lookback.isOpen}
            data={lookback.lookback}
            loading={lookback.loading}
            onClose={handleClose}
        />
    );
};
