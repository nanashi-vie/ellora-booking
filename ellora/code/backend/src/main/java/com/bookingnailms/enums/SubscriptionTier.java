package com.bookingnailms.enums;

public enum SubscriptionTier {
    STANDARD("Thường", "Shop yêu thích"), VIP("VIP", "Shop đối tác");
    private final String displayName;
    private final String badgeLabel;
    SubscriptionTier(String displayName, String badgeLabel) { this.displayName = displayName; this.badgeLabel = badgeLabel; }
    public String displayName() { return displayName; }
    public String badgeLabel() { return badgeLabel; }
}
