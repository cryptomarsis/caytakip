import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7F2'
  },
  authCard: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    borderRadius: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3
  },
  authTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1b4332',
    marginBottom: 8
  },
  authSubTitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20
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
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 13,
    fontSize: 17,
    color: '#333',
    marginBottom: 6
  },
  submitBtn: {
    width: '100%',
    backgroundColor: '#246548',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 18
  },
  submitBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 17
  },
  header: {
    backgroundColor: '#1F513D',
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
    backgroundColor: '#276047',
    paddingVertical: 10,
    paddingHorizontal: 8
  },
  navItem: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 20,
    marginRight: 6
  },
  navItemActive: {
    backgroundColor: '#E8F1E8'
  },
  navItemActiveAdmin: {
    backgroundColor: '#ffb703'
  },
  navText: {
    color: '#E3F0E5',
    fontWeight: '600',
    fontSize: 15
  },
  navTextActive: {
    color: '#1F513D',
    fontWeight: 'bold'
  },
  navTextActiveAdmin: {
    color: '#000000',
    fontWeight: 'bold'
  },
  content: {
    flex: 1,
    padding: 18
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
    gap: 10
  },
  quickAction: {
    width: '48%',
    minHeight: 118,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCE8DD',
    padding: 16,
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4
  },
  quickActionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E7F2E9',
    justifyContent: 'center',
    alignItems: 'center'
  },
  quickActionText: {
    color: '#1F513D',
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center'
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
