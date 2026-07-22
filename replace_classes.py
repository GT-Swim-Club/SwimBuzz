
import os
import re

files = [
    "swimbuzz/src/app/athletes/AddAthleteButton.tsx",
    "swimbuzz/src/app/athletes/AthletesClientWrapper.tsx",
    "swimbuzz/src/app/athletes/ImportMeetButton.tsx",
    "swimbuzz/src/app/athletes/ImportRosterButton.tsx",
    "swimbuzz/src/app/athletes/SyncTimesButton.tsx",
    "swimbuzz/src/app/athletes/[id]/AddSwimForm.tsx",
    "swimbuzz/src/app/athletes/[id]/AthleteActions.tsx",
    "swimbuzz/src/app/athletes/[id]/DeleteSwimButton.tsx",
    "swimbuzz/src/app/athletes/[id]/PersonalBestsGrid.tsx",
    "swimbuzz/src/app/layout.tsx",
    "swimbuzz/src/app/meets/CreateMeetButton.tsx",
    "swimbuzz/src/app/meets/EditMeetButton.tsx",
    "swimbuzz/src/app/meets/MeetFields.tsx",
    "swimbuzz/src/app/meets/MeetGalleryCard.tsx",
    "swimbuzz/src/app/meets/MeetResourceField.tsx",
    "swimbuzz/src/app/meets/[id]/AddMeetSwimButton.tsx",
    "swimbuzz/src/app/meets/[id]/AddTravelInfoButton.tsx",
    "swimbuzz/src/app/meets/[id]/EditMeetSwimButton.tsx",
    "swimbuzz/src/app/meets/[id]/EditSheetSeedButton.tsx",
    "swimbuzz/src/app/meets/[id]/EventOrderButton.tsx",
    "swimbuzz/src/app/meets/[id]/EventOrderTable.tsx",
    "swimbuzz/src/app/meets/[id]/ImportMeetResourcesButton.tsx",
    "swimbuzz/src/app/meets/[id]/IndividualSplitsModal.tsx",
    "swimbuzz/src/app/meets/[id]/MeetActions.tsx",
    "swimbuzz/src/app/meets/[id]/MeetRelayBuilder.tsx",
    "swimbuzz/src/app/meets/[id]/MeetRelayEditor.tsx",
    "swimbuzz/src/app/meets/[id]/MeetSheetSummarySection.tsx",
    "swimbuzz/src/app/meets/[id]/MeetSignupAthleteForm.tsx",
    "swimbuzz/src/app/meets/[id]/MeetSignupConfigButton.tsx",
    "swimbuzz/src/app/meets/[id]/MeetSignupSection.tsx",
    "swimbuzz/src/app/meets/[id]/PhotosButtons.tsx",
    "swimbuzz/src/app/meets/[id]/TravelInfoButtons.tsx",
    "swimbuzz/src/app/meets/page.tsx",
    "swimbuzz/src/app/practices/PracticeEditor.tsx",
    "swimbuzz/src/app/practices/[id]/CommentSection.tsx",
    "swimbuzz/src/app/practices/[id]/PracticeActions.tsx",
    "swimbuzz/src/app/practices/[id]/PracticeDetail.tsx",
    "swimbuzz/src/app/practices/page.tsx",
    "swimbuzz/src/app/qualifiers/UploadStandardsButton.tsx",
    "swimbuzz/src/components/CancelPendingProfileChangesButton.tsx",
    "swimbuzz/src/components/LiveSearch.tsx",
    "swimbuzz/src/components/Nav.tsx",
    "swimbuzz/src/components/NicknameTagsInput.tsx",
    "swimbuzz/src/components/RichTextField.tsx",
    "swimbuzz/src/components/RunScraperButton.tsx"
]

mappings = {
    "bg-white": "bg-background",
    "dark:bg-zinc-900": "bg-background",
    "dark:bg-zinc-950": "bg-background",
    "text-gray-900": "text-foreground",
    "dark:text-zinc-100": "text-foreground",
    "text-gray-500": "text-foreground-secondary",
    "dark:text-zinc-400": "text-foreground-secondary",
    "text-gray-600": "text-foreground-secondary",
    "dark:text-zinc-300": "text-foreground-secondary",
    "border-gray-200": "border-border",
    "dark:border-zinc-700": "border-border",
    "hover:bg-gray-50": "hover:bg-fill-secondary",
    "dark:hover:bg-zinc-800": "hover:bg-fill-secondary",
    "bg-indigo-600": "bg-primary",
    "text-white": "text-primary-text",
    "hover:bg-indigo-700": "hover:bg-primary-hover",
    "text-indigo-600": "text-primary",
    "dark:text-indigo-400": "text-primary",
}

for file_path in files:
    if os.path.exists(file_path):
        with open(file_path, 'r') as f:
            content = f.read()
        
        new_content = content
        for old, new in mappings.items():
            new_content = new_content.replace(old, new)
            
        with open(file_path, 'w') as f:
            f.write(new_content)
        print(f"Processed {file_path}")
    else:
        print(f"File not found: {file_path}")
