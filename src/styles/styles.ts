import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4F7F2'
  },
  authScreen: {
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 24
  },
  authCard: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#DCE9E0',
    shadowColor: '#123D2C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.09,
    shadowRadius: 16,
    elevation: 4
  },
  authBrand: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14
  },
  authBrandMark: {
    width: 58,
    height: 58,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#174E3A'
  },
  authBrandImage: {
    width: '100%',
    height: '100%'
  },
  authTitle: {
    fontSize: 27,
    fontWeight: '800',
    color: '#174E3A'
  },
  authEyebrow: {
    color: '#668273',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.9,
    marginTop: 2
  },
  authSubTitle: {
    width: '100%',
    fontSize: 15,
    lineHeight: 21,
    color: '#52695A',
    marginBottom: 14
  },
  authModeLink: {
    color: '#1F6B4F',
    fontWeight: '800',
    textDecorationLine: 'underline',
    textAlign: 'center'
  },
  label: {
    alignSelf: 'flex-start',
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
    marginTop: 8
  },
  input: {
    width: '100%',
    backgroundColor: '#F8FAF7',
    borderWidth: 1,
    borderColor: '#D7E1D7',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 17,
    color: '#333',
    marginBottom: 6
  },
  submitBtn: {
    width: '100%',
    backgroundColor: '#1F6B4F',
    minHeight: 54,
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 18
  },
  submitBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16
  },
  submitBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9
  },
  actionBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5
  },
  iconHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14
  },
  iconHeadingCompact: {
    gap: 8,
    marginBottom: 10
  },
  iconHeadingBadge: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E7F4EC'
  },
  iconHeadingBadgeCompact: {
    width: 32,
    height: 32,
    borderRadius: 11
  },
  header: {
    backgroundColor: '#174E3A',
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  headerTitle: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 18
  },
  headerSubtitle: {
    color: '#D6E9D9',
    fontSize: 14,
    marginTop: 2
  },
  headerWarning: {
    color: '#FFE1A6',
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 4
  },
  logoutBtn: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8
  },
  logoutBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold'
  },
  navBar: {
    backgroundColor: '#174E3A',
    paddingVertical: 9,
    paddingHorizontal: 10
  },
  navBarContent: {
    gap: 7,
    paddingRight: 8
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 42,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 14
  },
  navItemActive: {
    backgroundColor: '#E8F1E8'
  },
  navItemActiveAdmin: {
    backgroundColor: '#ffb703'
  },
  navText: {
    color: '#D9E9DE',
    fontWeight: '700',
    fontSize: 14
  },
  navTextActive: {
    color: '#1F513D',
    fontWeight: 'bold'
  },
  navTextActiveAdmin: {
    color: '#000000',
    fontWeight: 'bold'
  },
  mobileBottomNav: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E9E2',
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 4,
    shadowColor: '#173F2E',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 10
  },
  mobileBottomNavItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    minHeight: 54
  },
  mobileBottomNavIcon: {
    height: 33,
    minWidth: 42,
    borderRadius: 16.5,
    alignItems: 'center',
    justifyContent: 'center'
  },
  mobileBottomNavIconActive: {
    backgroundColor: '#1F6B4F'
  },
  mobileBottomNavText: {
    color: '#66786C',
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700',
    textAlign: 'center'
  },
  mobileBottomNavTextActive: {
    color: '#174E3A',
    fontWeight: '800'
  },
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4
  },
  content: {
    flex: 1,
    padding: 18
  },
  mobileShell: {
    flex: 1
  },
  desktopShell: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#F2F6F1'
  },
  appMain: {
    flex: 1,
    minWidth: 0
  },
  desktopSidebar: {
    width: 276,
    backgroundColor: '#143D2D',
    borderRightWidth: 1,
    borderRightColor: '#0D2E21'
  },
  desktopBrand: {
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)'
  },
  desktopBrandMark: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#D8F0D8',
    alignItems: 'center',
    justifyContent: 'center'
  },
  desktopBrandMarkText: {
    color: '#174735',
    fontSize: 23,
    fontWeight: '900'
  },
  desktopBrandTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800'
  },
  desktopBrandSubtitle: {
    color: '#B9D5C0',
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600'
  },
  desktopMenuScroll: {
    flex: 1
  },
  desktopMenuContent: {
    paddingHorizontal: 13,
    paddingTop: 16,
    paddingBottom: 20
  },
  desktopMenuGroup: {
    color: '#93B89D',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.1,
    marginTop: 15,
    marginBottom: 7,
    marginLeft: 10
  },
  desktopNavItem: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 10,
    marginBottom: 3
  },
  desktopNavItemActive: {
    backgroundColor: '#E5F1E7'
  },
  desktopNavIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginRight: 11
  },
  desktopNavIconActive: {
    backgroundColor: '#1F6B4F'
  },
  desktopNavIconText: {
    color: '#E2F3E5',
    fontSize: 18,
    fontWeight: '800'
  },
  desktopNavIconTextActive: {
    color: '#1B563D'
  },
  desktopNavCopy: {
    flex: 1
  },
  desktopNavText: {
    color: '#F4FAF5',
    fontWeight: '700',
    fontSize: 14
  },
  desktopNavTextActive: {
    color: '#173F2E'
  },
  desktopNavHint: {
    color: '#A9C8B0',
    fontSize: 11,
    marginTop: 2
  },
  desktopNavHintActive: {
    color: '#527561'
  },
  desktopSidebarFooter: {
    margin: 13,
    padding: 14,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.09)'
  },
  desktopFooterName: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14
  },
  desktopFooterMeta: {
    color: '#A9C8B0',
    marginTop: 3,
    fontSize: 12
  },
  desktopFooterSync: {
    color: '#F8D889',
    marginTop: 9,
    fontSize: 12,
    fontWeight: '700'
  },
  desktopFooterWarning: {
    color: '#FFD8D3',
    marginTop: 9,
    fontSize: 12,
    fontWeight: '700'
  },
  desktopHeader: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#DCE7DE',
    shadowColor: '#133724',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2
  },
  desktopHeaderTitle: {
    color: '#1B4935',
    fontSize: 21
  },
  desktopHeaderSubtitle: {
    color: '#577364',
    fontSize: 13
  },
  desktopLogoutBtn: {
    backgroundColor: '#1F6245',
    paddingHorizontal: 16,
    paddingVertical: 10
  },
  desktopScroll: {
    padding: 0,
    backgroundColor: '#F2F6F1'
  },
  desktopContent: {
    width: '100%',
    maxWidth: 1500,
    alignSelf: 'center',
    padding: 30,
    paddingBottom: 48
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#1b4332',
    marginBottom: 12
  },
  statsGrid: {
    gap: 10
  },
  quickActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 2
  },
  quickAction: {
    width: '48%',
    minHeight: 126,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DCE8DD',
    padding: 15,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    elevation: 1,
    shadowColor: '#123D2C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4
  },
  quickActionPrimary: {
    width: '100%',
    minHeight: 98,
    backgroundColor: '#1F6B4F',
    borderColor: '#1F6B4F',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 14,
    shadowOpacity: 0.13,
    elevation: 3
  },
  quickActionIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: '#E7F2E9',
    justifyContent: 'center',
    alignItems: 'center'
  },
  quickActionPrimaryIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18
  },
  quickActionCopy: {
    flexShrink: 1
  },
  quickActionText: {
    color: '#1F513D',
    fontWeight: '800',
    fontSize: 15
  },
  quickActionSubText: {
    color: '#667A6C',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3
  },
  quickActionPrimaryText: {
    color: '#FFFFFF',
    fontSize: 19
  },
  quickActionPrimarySubText: {
    color: '#DCEDE3',
    fontSize: 13
  },
  dashboardNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: 16,
    backgroundColor: '#FFF6E4',
    borderWidth: 1,
    borderColor: '#F1D9A4',
    padding: 13,
    marginTop: 14
  },
  gettingStartedCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D7EBDD',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#123D2C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2
  },
  gettingStartedHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  gettingStartedIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#E7F4EC',
    alignItems: 'center',
    justifyContent: 'center'
  },
  gettingStartedTitle: {
    color: '#174E3A',
    fontSize: 17,
    fontWeight: '800'
  },
  gettingStartedText: {
    color: '#5C7063',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2
  },
  gettingStartedSteps: {
    gap: 7,
    marginTop: 14
  },
  gettingStartedStep: {
    color: '#3E5548',
    fontSize: 13,
    lineHeight: 19
  },
  gettingStartedNumber: {
    color: '#1F6B4F',
    fontWeight: '900'
  },
  dashboardNoticePositive: {
    backgroundColor: '#ECF7EF',
    borderColor: '#C9E5D0'
  },
  dashboardNoticeIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FCE8BD',
    justifyContent: 'center',
    alignItems: 'center'
  },
  dashboardNoticeIconPositive: {
    backgroundColor: '#D9F0DF'
  },
  dashboardNoticeTitle: {
    color: '#54401B',
    fontSize: 15,
    fontWeight: '800'
  },
  dashboardNoticeText: {
    color: '#786342',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2
  },
  dashboardNoticeAction: {
    color: '#8A5B14',
    fontSize: 13,
    fontWeight: '900'
  },
  dashboardSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 12
  },
  dashboardSectionLink: {
    color: '#1F6B4F',
    fontSize: 14,
    fontWeight: '800'
  },
  dashboardRecordStatus: {
    fontWeight: '800',
    fontSize: 13,
    marginTop: 5
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 14,
    borderLeftWidth: 0,
    borderWidth: 1,
    borderColor: '#E1EAE2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 2
  },
  statTitle: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600'
  },
  statValue: {
    fontSize: 21,
    fontWeight: 'bold',
    color: '#1F513D',
    marginTop: 4
  },
  statLabel: {
    fontSize: 14,
    color: '#47635a',
    marginTop: 5,
    fontWeight: '600'
  },
  adCard: {
    backgroundColor: '#FFF9ED',
    borderWidth: 1,
    borderColor: '#f4c95d',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12
  },
  adLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#9a6700',
    marginBottom: 4
  },
  adTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1b4332'
  },
  adText: {
    fontSize: 12,
    color: '#555',
    marginTop: 5
  },
  adCompany: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#6c4f00',
    marginTop: 8
  },
  sponsorBanner: {
    backgroundColor: '#173F2E',
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#C9DCCB',
    shadowColor: '#0B241A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3
  },
  sponsorBannerPress: {
    opacity: 0.96
  },
  sponsorBannerImage: {
    width: '100%',
    height: 148,
    backgroundColor: '#285E43'
  },
  sponsorBannerFallback: {
    height: 110,
    paddingHorizontal: 18,
    paddingVertical: 16,
    justifyContent: 'flex-end',
    backgroundColor: '#245D42'
  },
  sponsorBannerFallbackMark: {
    color: '#D7EEDB',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 0.4
  },
  sponsorBannerInfo: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF'
  },
  sponsorBannerMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 6
  },
  sponsorBannerBadge: {
    color: '#416C51',
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 0.8
  },
  sponsorBannerFirm: {
    color: '#416C51',
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
    textAlign: 'right'
  },
  sponsorBannerTitle: {
    color: '#173F2E',
    fontSize: 18,
    fontWeight: '800'
  },
  sponsorBannerText: {
    color: '#557064',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4
  },
  sponsorBannerAction: {
    color: '#246548',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 9
  },
  bannerHelp: {
    color: '#557064',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8
  },
  bannerPreviewLabel: {
    color: '#416C51',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 12,
    marginBottom: 7
  },
  bannerListTitle: {
    color: '#1B4332',
    fontSize: 17,
    fontWeight: '800',
    marginTop: 8,
    marginBottom: 8
  },
  operationFeedback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 18,
    marginTop: 14,
    paddingHorizontal: 15,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#E7F2E9',
    borderWidth: 1,
    borderColor: '#BBDCC3'
  },
  operationFeedbackSuccess: {
    backgroundColor: '#E7F2E9',
    borderColor: '#BBDCC3'
  },
  operationFeedbackError: {
    backgroundColor: '#FDECEC',
    borderColor: '#F0C5C1'
  },
  operationFeedbackTitle: {
    color: '#1B4332',
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 2
  },
  operationFeedbackText: {
    color: '#456052',
    fontSize: 13,
    lineHeight: 18
  },
  operationFeedbackClose: {
    color: '#456052',
    fontSize: 24,
    lineHeight: 26,
    paddingHorizontal: 4
  },
  deleteConfirmModal: {
    maxWidth: 440
  },
  deleteConfirmButton: {
    backgroundColor: '#B23A3A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8
  },
  deleteConfirmError: {
    backgroundColor: '#FFF0EF',
    borderWidth: 1,
    borderColor: '#F0C5C1',
    borderRadius: 9,
    padding: 10,
    marginTop: 4
  },
  deleteConfirmErrorText: {
    color: '#9F3030',
    fontSize: 13,
    lineHeight: 18
  },
  monthCard: {
    backgroundColor: '#eef7f1',
    borderRadius: 12,
    padding: 10,
    marginBottom: 14
  },
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1b4332'
  },
  monthTotal: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#d62828'
  },
  priceCard: {
    backgroundColor: '#ffffff',
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderLeftWidth: 4,
    borderLeftColor: '#2a9d8f'
  },
  priceValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1b4332',
    marginVertical: 3
  },
  bestPriceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFF7E6',
    borderWidth: 1,
    borderColor: '#F0D9A4',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16
  },
  bestPriceIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#F8E8BD',
    alignItems: 'center',
    justifyContent: 'center'
  },
  bestPriceLabel: {
    color: '#7A5924',
    fontSize: 13,
    fontWeight: '600'
  },
  bestPriceValue: {
    color: '#3D321E',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 2
  },
  bestPriceMeta: {
    color: '#806C45',
    fontSize: 13,
    marginTop: 3
  },
  factoryCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E9E1',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#153828',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1
  },
  factoryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14
  },
  factoryIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E7F2E9',
    alignItems: 'center',
    justifyContent: 'center'
  },
  factoryName: {
    color: '#1F513D',
    fontSize: 18,
    fontWeight: 'bold'
  },
  factoryMainPrice: {
    backgroundColor: '#F2F7F2',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  factoryPriceLabel: {
    color: '#5B7061',
    fontSize: 13,
    fontWeight: '600'
  },
  factoryPriceValue: {
    color: '#1F513D',
    fontSize: 21,
    fontWeight: 'bold',
    marginTop: 3
  },
  factoryPriceDate: {
    color: '#6D7E70',
    fontSize: 13,
    marginTop: 4
  },
  factoryEmptyPrice: {
    color: '#6D7E70',
    fontSize: 14,
    backgroundColor: '#F7F9F7',
    padding: 14,
    borderRadius: 12
  },
  factoryDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 12
  },
  factoryDetailLabel: {
    color: '#56715E',
    fontSize: 14,
    fontWeight: '600'
  },
  factoryDetailValue: {
    color: '#314A39',
    fontSize: 14,
    fontWeight: '600'
  },
  compactDeleteBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EACACA',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7
  },
  compactDeleteText: {
    color: '#A84646',
    fontSize: 13,
    fontWeight: 'bold'
  },
  infoCard: {
    backgroundColor: '#eaf4ff',
    padding: 14,
    borderRadius: 10,
    marginTop: 16
  },
  infoTitle: {
    fontWeight: 'bold',
    color: '#1d3557',
    marginBottom: 5
  },
  infoText: {
    color: '#4a5568',
    fontSize: 12,
    lineHeight: 18
  },
  emptyText: {
    color: '#888',
    fontStyle: 'italic',
    textAlign: 'center',
    marginVertical: 20
  },
  listItem: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1
  },
  listTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1b4332'
  },
  listSubText: {
    fontSize: 14,
    color: '#555',
    marginTop: 2
  },
  editBtn: {
    backgroundColor: '#3E7C5D',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6
  },
  deleteBtn: {
    backgroundColor: '#B44B4B',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6
  },
  actionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold'
  },
  paymentHistoryCard: {
    backgroundColor: '#F5FAF6',
    borderWidth: 1,
    borderColor: '#D8E8DB',
    borderRadius: 12,
    padding: 13,
    marginBottom: 9
  },
  paymentHistoryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10
  },
  paymentHistoryTitle: {
    color: '#1B513B',
    fontSize: 16,
    fontWeight: '800'
  },
  paymentHistoryAmount: {
    color: '#237044',
    fontSize: 15,
    fontWeight: '900'
  },
  paymentHistoryMeta: {
    color: '#52695A',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 3
  },
  paymentHistoryNote: {
    color: '#47635A',
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 6
  },
  paymentHistoryActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 11
  },
  paymentEditBtn: {
    backgroundColor: '#3E7C5D',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8
  },
  paymentDeleteBtn: {
    backgroundColor: '#B44B4B',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8
  },
  paymentActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800'
  },
  historyCount: {
    color: '#557064',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
    marginBottom: 10
  },
  historyActions: {
    gap: 6,
    minWidth: 78
  },
  historyPayBtn: {
    backgroundColor: '#246548',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6
  },
  historyRemaining: {
    fontWeight: '800',
    marginTop: 4,
    fontSize: 13
  },
  legacyPaymentEditBtn: {
    alignSelf: 'flex-start',
    marginTop: 11,
    borderWidth: 1,
    borderColor: '#2E7654',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF'
  },
  legacyPaymentEditText: {
    color: '#1F6847',
    fontSize: 13,
    fontWeight: '800'
  },
  formCard: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 16
  },
  formTitle: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#1b4332',
    marginBottom: 12
  },
  formHelp: {
    color: '#47635a',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12
  },
  detailsToggle: {
    alignSelf: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginTop: 4
  },
  detailsToggleText: {
    color: '#246548',
    fontSize: 15,
    fontWeight: 'bold'
  },
  buttonDisabled: {
    opacity: 0.65
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 10
  },
  switchLabel: {
    fontWeight: 'bold',
    color: '#1B4332',
    fontSize: 16
  },
  rowBtnGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginVertical: 6
  },
  groupBtn: {
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D7E1D7',
    backgroundColor: '#F8FAF7'
  },
  groupBtnActive: {
    backgroundColor: '#246548',
    borderColor: '#246548'
  },
  groupBtnText: {
    fontSize: 15,
    color: '#333'
  },
  groupBtnTextActive: {
    color: '#ffffff',
    fontWeight: 'bold'
  },
  moreRow: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E1EAE2',
    borderRadius: 14,
    minHeight: 76,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  moreChevron: {
    color: '#246548',
    fontSize: 30,
    lineHeight: 30,
    fontWeight: '300'
  },
  secondaryBtn: {
    borderColor: '#246548',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 14,
    alignItems: 'center'
  },
  secondaryBtnText: {
    color: '#246548',
    fontSize: 14,
    fontWeight: 'bold'
  },
  legalSection: {
    marginBottom: 14
  },
  legalTitle: {
    color: '#1F513D',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 4
  },
  legalText: {
    color: '#47635A',
    fontSize: 14,
    lineHeight: 20
  },
  dangerCard: {
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#F0C7C7',
    borderRadius: 14,
    padding: 16,
    marginBottom: 18
  },
  dangerTitle: {
    color: '#9F3030',
    fontSize: 18,
    fontWeight: 'bold'
  },
  dangerText: {
    color: '#7A4545',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6
  },
  dangerBtn: {
    borderRadius: 10,
    backgroundColor: '#B44B4B',
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 14
  },
  dangerBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold'
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 5
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1b4332',
    marginBottom: 12
  },
  modalBtnGroup: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16
  },
  modalCancelBtn: {
    backgroundColor: '#6c757d',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8
  },
  modalSaveBtn: {
    backgroundColor: '#1b4332',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8
  },
  modalBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 13
  }
});
