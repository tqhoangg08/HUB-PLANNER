import type { AccountPasswordController } from '../../hooks/useAccountPassword';
import type { AccountProfileDraftController } from '../../hooks/useAccountProfileDraft';
import { AccountAcademicProfileFields } from './AccountAcademicProfileFields';
import { AccountPasswordOtpModal } from './AccountPasswordOtpModal';
import { AccountPasswordPanel } from './AccountPasswordPanel';
import { AccountPublicProfileFields } from './AccountPublicProfileFields';
import { AccountSettingsModal } from './AccountSettingsModal';

interface AccountSettingsOverlaysProps {
    open: boolean;
    mobile: boolean;
    email?: string;
    avatarSeed: string;
    profile: AccountProfileDraftController;
    password: AccountPasswordController;
    onClose: () => void;
}

export const AccountSettingsOverlays = ({
    open,
    mobile,
    email,
    avatarSeed,
    profile,
    password,
    onClose,
}: AccountSettingsOverlaysProps) => (
    <>
        <AccountSettingsModal
            open={open}
            mobile={mobile}
            error={profile.profileError}
            saving={profile.profileSaving}
            canSave={Boolean(
                profile.draftProgram
                && profile.draftCohort
                && profile.draftMajor
                && profile.draftSpecialization
            )}
            onClose={onClose}
            onSave={profile.saveProfile}
        >
            <AccountPublicProfileFields
                fullName={profile.draftFullName}
                bio={profile.draftBio}
                className={profile.draftClassName}
                defaultClassName={profile.defaultClassName}
                profileTags={profile.draftProfileTags}
                publicProfileEnabled={profile.draftPublicProfileEnabled}
                showProfileStats={profile.draftShowProfileStats}
                avatarUrl={profile.draftAvatarUrl}
                avatarPreview={profile.draftAvatarPreview}
                avatarSeed={avatarSeed}
                onFullNameChange={profile.setDraftFullName}
                onBioChange={profile.setDraftBio}
                onClassNameChange={profile.setDraftClassName}
                onProfileTagsChange={profile.setDraftProfileTags}
                onPublicProfileEnabledChange={profile.updatePublicProfileEnabled}
                onShowProfileStatsChange={profile.setDraftShowProfileStats}
                onAvatarColorChange={profile.selectAvatarColor}
                onAvatarFileSelect={profile.selectAvatarFile}
                onInvalidAvatarFile={profile.rejectAvatarFile}
            />

            <AccountPasswordPanel
                error={password.passwordChangeError}
                notice={password.passwordChangeNotice}
                turnstileToken={password.accountPasswordTurnstileToken}
                showPasswordChange={password.showPasswordChange}
                otpMode={password.isAccountPasswordOtpMode}
                cooldownRemaining={password.accountPasswordOtpCooldownRemaining}
                loading={password.passwordChangeLoading}
                currentPassword={password.currentPassword}
                otp={password.accountPasswordOtp}
                newPassword={password.newPassword}
                confirmNewPassword={password.confirmNewPassword}
                showCurrentPassword={password.showCurrentPassword}
                showNewPassword={password.showNewPassword}
                onTurnstileTokenChange={password.setAccountPasswordTurnstileToken}
                onForgotPassword={password.forgotAccountPassword}
                onStartPasswordChange={password.startPasswordChange}
                onCurrentPasswordChange={password.setCurrentPassword}
                onOtpChange={password.setAccountPasswordOtp}
                onNewPasswordChange={password.setNewPassword}
                onConfirmNewPasswordChange={password.setConfirmNewPassword}
                onToggleCurrentPasswordVisibility={() => (
                    password.setShowCurrentPassword(previous => !previous)
                )}
                onToggleNewPasswordVisibility={() => (
                    password.setShowNewPassword(previous => !previous)
                )}
                onCancelPasswordChange={password.cancelPasswordChange}
                onSubmit={password.changeAccountPassword}
            />

            <AccountAcademicProfileFields
                selectedProgram={profile.draftProgram}
                selectedCohort={profile.draftCohort}
                selectedMajor={profile.draftMajor}
                selectedSpecialization={profile.draftSpecialization}
                programs={profile.programOptions}
                cohortOptions={profile.cohortOptions}
                majorOptions={profile.majorOptions}
                onProgramChange={profile.selectProgram}
                onCohortChange={profile.selectCohort}
                onMajorChange={profile.selectMajor}
                onSpecializationChange={profile.selectSpecialization}
                manualTotalCredits={profile.draftManualTotalCredits}
                onManualTotalCreditsChange={profile.setDraftManualTotalCredits}
            />
        </AccountSettingsModal>

        <AccountPasswordOtpModal
            open={open && password.showAccountPasswordOtpModal}
            email={email}
            error={password.passwordChangeError}
            notice={password.passwordChangeNotice}
            otp={password.accountPasswordOtp}
            newPassword={password.newPassword}
            confirmNewPassword={password.confirmNewPassword}
            showNewPassword={password.showNewPassword}
            cooldownRemaining={password.accountPasswordOtpCooldownRemaining}
            loading={password.passwordChangeLoading}
            onClose={() => password.setShowAccountPasswordOtpModal(false)}
            onResendOtp={password.forgotAccountPassword}
            onOtpChange={password.setAccountPasswordOtp}
            onNewPasswordChange={password.setNewPassword}
            onConfirmNewPasswordChange={password.setConfirmNewPassword}
            onToggleNewPasswordVisibility={() => (
                password.setShowNewPassword(previous => !previous)
            )}
            onSubmit={password.changeAccountPassword}
        />
    </>
);
