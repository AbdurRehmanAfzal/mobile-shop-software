// View Mobile Stock Page - With filtering by Brand, Model, PTA Status, Color
import React, { useState, useEffect } from 'react';
import BilingualLabel from '../components/BilingualLabel';
import BilingualButton from '../components/BilingualButton';
import BilingualAlert from '../components/BilingualAlert';
import BackButton from '../components/BackButton';
import Modal from '../components/Modal';
import { mobileAPI, brandsAPI, modelsAPI, colorAPI, storageAPI } from '../services/api';

const ViewStock = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [mobileStock, setMobileStock] = useState([]);
  const [showColumnSelector, setShowColumnSelector] = useState(false);

  // Detail Modal States
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedMobile, setSelectedMobile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [storages, setStorages] = useState([]);

  // Filter States
  const [filters, setFilters] = useState({
    model_id: '',
    color: '',
    condition: '', // BOX_PACK, PATCHED, USED, or empty for all
  });

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState({
    id: true,
    brand: true,
    model: true,
    storage: true,
    color: true,
    pta_approval_status: true,
    condition: true,
    cost_price: true,
    sale_price: true,
    imei1: true,
    imei2: false,
    serial_number: false,
    sim_time: false,
    received_date: false,
  });

  // Dropdown Data
  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  const [colors, setColors] = useState([]);

  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, []);

  // Load models on component mount
  useEffect(() => {
    loadAllModels();
  }, []);

  // Load storages
  useEffect(() => {
    loadStorages();
  }, []);

  // Load stock whenever filters change
  useEffect(() => {
    loadStock();
  }, [filters]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [brandsRes, colorsRes] = await Promise.all([
        brandsAPI.getAll(),
        colorAPI.getAll(),
      ]);

      if (brandsRes.success) setBrands(brandsRes.data || []);
      if (colorsRes.success) setColors(colorsRes.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadAllModels = async () => {
    try {
      const res = await modelsAPI.getAll();
      if (res.success) {
        setModels(res.data || []);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const loadStorages = async () => {
    try {
      const res = await storageAPI.getAll();
      if (res.success) {
        setStorages(res.data || []);
      }
    } catch (err) {
      console.error('Error loading storages:', err.message);
    }
  };

  // View mobile details
  const handleViewMobile = (mobile) => {
    setSelectedMobile(mobile);
    setEditData(mobile);
    setIsEditing(false);
    setShowDetailModal(true);
  };

  // Edit mobile
  const handleEditMobile = async () => {
    setLoading(true);
    try {
      const updatePayload = {
        sale_price: editData.sale_price !== 'N/A' ? parseFloat(editData.sale_price) : null,
        is_damaged: editData.is_damaged,
        serial_number: editData.serial_number !== 'N/A' ? editData.serial_number : null,
        pta_approval_status: editData.pta_approval_status,
        sim_time: editData.sim_time !== 'N/A' ? editData.sim_time : null,
        notes: editData.notes || null,
        // Trade-in Customer Information
        cnic_number: editData.cnic_number !== 'N/A' ? editData.cnic_number : null,
        cnic_front_image: editData.cnic_front_image !== 'N/A' && editData.cnic_front_image ? editData.cnic_front_image : null,
        cnic_back_image: editData.cnic_back_image !== 'N/A' && editData.cnic_back_image ? editData.cnic_back_image : null,
        mobile_images: editData.mobile_images !== 'N/A' && editData.mobile_images ? editData.mobile_images : null,
      };

      const res = await mobileAPI.update(selectedMobile.id, updatePayload);
      if (res.success) {
        setSuccess('Mobile updated successfully!');
        setShowDetailModal(false);
        setIsEditing(false);
        loadStock();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(res.error || 'Failed to update mobile');
      }
    } catch (err) {
      setError(err.message || 'Error updating mobile');
    } finally {
      setLoading(false);
    }
  };

  // Delete mobile
  const handleDeleteMobile = async () => {
    if (!window.confirm('Are you sure you want to delete this mobile? This action cannot be undone.')) {
      return;
    }

    setLoading(true);
    try {
      const res = await mobileAPI.delete(selectedMobile.id);
      if (res.success) {
        setSuccess('Mobile deleted successfully!');
        setShowDetailModal(false);
        loadStock();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(res.error || 'Failed to delete mobile');
      }
    } catch (err) {
      setError(err.message || 'Error deleting mobile');
    } finally {
      setLoading(false);
    }
  };

  const loadStock = async () => {
    try {
      // Fetch all mobiles with IN_STOCK status
      const res = await mobileAPI.getAll('IN_STOCK');

      if (res.success) {
        let filtered = res.data || [];

        // Filter by model_id only (brand filter requires additional API call)
        if (filters.model_id) {
          filtered = filtered.filter(
            (mobile) => mobile.model_id === parseInt(filters.model_id)
          );
        }

        if (filters.color) {
          filtered = filtered.filter(
            (mobile) => mobile.color && mobile.color.toLowerCase().includes(filters.color.toLowerCase())
          );
        }

        if (filters.condition) {
          filtered = filtered.filter(
            (mobile) => mobile.condition === filters.condition
          );
        }

        setMobileStock(filtered);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const resetFilters = () => {
    setFilters({
      model_id: '',
      color: '',
      condition: '',
    });
  };

  const toggleColumn = (columnName) => {
    setVisibleColumns((prev) => ({
      ...prev,
      [columnName]: !prev[columnName],
    }));
  };

  const resetColumns = () => {
    setVisibleColumns({
      id: true,
      brand: true,
      model: true,
      storage: true,
      color: true,
      pta_approval_status: true,
      condition: true,
      cost_price: true,
      sale_price: true,
      imei1: true,
      imei2: false,
      serial_number: false,
      sim_time: false,
      received_date: false,
    });
  };

  const getConditionColor = (condition) => {
    switch (condition) {
      case 'new':
        return 'bg-green-100 text-green-800';
      case 'patched':
        return 'bg-yellow-100 text-yellow-800';
      case 'used':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getConditionLabel = (condition) => {
    switch (condition) {
      case 'new':
        return 'Box Pack (نیا)';
      case 'patched':
        return 'Patched (مرمت شدہ)';
      case 'used':
        return 'Used (استعمال شدہ)';
      default:
        return condition;
    }
  };

  const getPTAApprovalLabel = (pta_approval_status) => {
    if (!pta_approval_status) return 'N/A';
    return pta_approval_status === 'approve' ? '✓ Approve' : '✗ Not Approve';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      {/* Back Button */}
      <div className="mb-6">
        <BackButton fallbackPath="/" />
      </div>

      {/* Header */}
      <div className="mb-8">
        <BilingualLabel
          en="Mobile Stock Inventory"
          ur="موبائل اسٹاک انوینٹری"
          size="2xl"
          bold={true}
          color="text-gray-900"
        />
      </div>

      {/* Error Alert */}
      {error && (
        <BilingualAlert
          en={error}
          ur={error}
          type="error"
          onClose={() => setError(null)}
        />
      )}

      {/* Success Alert */}
      {success && (
        <BilingualAlert
          en={success}
          ur={success}
          type="success"
          onClose={() => setSuccess(null)}
        />
      )}

      {/* Column Selector Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
        <div className="flex justify-between items-center mb-4">
          <BilingualLabel
            en="Customize Columns"
            ur="کالمز کو حسب ضرورت بنائیں"
            size="lg"
            bold={true}
          />
          <button
            onClick={() => setShowColumnSelector(!showColumnSelector)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {showColumnSelector ? 'Hide' : 'Show'} Options
          </button>
        </div>

        {showColumnSelector && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
              {Object.keys(visibleColumns).map((col) => (
                <label key={col} className="flex items-center gap-2 p-2 bg-white rounded cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={visibleColumns[col]}
                    onChange={() => toggleColumn(col)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm font-medium text-gray-700 capitalize">
                    {col.replace(/_/g, ' ')}
                  </span>
                </label>
              ))}
            </div>
            <BilingualButton
              en="Reset Columns"
              ur="کالمز دوبارہ سیٹ کریں"
              variant="secondary"
              size="sm"
              onClick={resetColumns}
            />
          </div>
        )}
      </div>

      {/* Filters Section */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <BilingualLabel
          en="Filters"
          ur="فلٹرز"
          size="lg"
          bold={true}
          className="mb-6"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Model Filter */}
          <div>
            <BilingualLabel en="Model" ur="ماڈل" size="sm" bold={true} className="mb-2" />
            <select
              value={filters.model_id}
              onChange={(e) => handleFilterChange('model_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Models</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} (ID: {model.id})
                </option>
              ))}
            </select>
          </div>

          {/* Color Filter */}
          <div>
            <BilingualLabel en="Color" ur="رنگ" size="sm" bold={true} className="mb-2" />
            <input
              type="text"
              placeholder="Search color..."
              value={filters.color}
              onChange={(e) => handleFilterChange('color', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Condition Filter */}
          <div>
            <BilingualLabel en="Condition" ur="حالت" size="sm" bold={true} className="mb-2" />
            <select
              value={filters.condition}
              onChange={(e) => handleFilterChange('condition', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Conditions</option>
              <option value="new">Box Pack (نیا)</option>
              <option value="patched">Patched (مرمت شدہ)</option>
              <option value="used">Used (استعمال شدہ)</option>
            </select>
          </div>
        </div>

        {/* Reset Button */}
        <div className="mt-6">
          <BilingualButton
            en="Reset Filters"
            ur="فلٹرز صاف کریں"
            variant="secondary"
            size="md"
            onClick={resetFilters}
          />
        </div>
      </div>

      {/* Stock Summary */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-8">
        <div className="flex items-center justify-between">
          <div>
            <BilingualLabel
              en={`Total Stock: ${mobileStock.length} units`}
              ur={`کل اسٹاک: ${mobileStock.length} یونٹس`}
              size="lg"
              bold={true}
            />
          </div>
          <div className="text-3xl font-bold text-blue-600">{mobileStock.length}</div>
        </div>
      </div>

      {/* Stock Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {mobileStock.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500 text-lg">No mobile phones found matching your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  {visibleColumns.id && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">ID</th>}
                  {visibleColumns.brand && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Brand</th>}
                  {visibleColumns.model && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Model</th>}
                  {visibleColumns.storage && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Storage</th>}
                  {visibleColumns.color && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Color</th>}
                  {visibleColumns.pta_approval_status && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">PTA Approval</th>}
                  {visibleColumns.condition && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Condition</th>}
                  {visibleColumns.cost_price && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Cost Price</th>}
                  {visibleColumns.sale_price && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Sale Price</th>}
                  {visibleColumns.imei1 && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">IMEI1</th>}
                  {visibleColumns.imei2 && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">IMEI2</th>}
                  {visibleColumns.serial_number && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Serial #</th>}
                  {visibleColumns.sim_time && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">SIM Time</th>}
                  {visibleColumns.received_date && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Received</th>}
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {mobileStock.map((mobile, index) => (
                  <tr
                    key={mobile.id}
                    className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                  >
                    {visibleColumns.id && <td className="px-6 py-4 text-sm text-gray-900 font-medium">{mobile.id}</td>}
                    {visibleColumns.brand && <td className="px-6 py-4 text-sm text-gray-700">{mobile.brand || 'N/A'}</td>}
                    {visibleColumns.model && <td className="px-6 py-4 text-sm text-gray-700">{mobile.model || 'N/A'}</td>}
                    {visibleColumns.storage && <td className="px-6 py-4 text-sm text-gray-700">{mobile.storage || 'N/A'}</td>}
                    {visibleColumns.color && <td className="px-6 py-4 text-sm text-gray-700">{mobile.color || 'N/A'}</td>}
                    {visibleColumns.pta_approval_status && (
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-semibold ${
                            mobile.pta_approval_status === 'approve'
                              ? 'bg-green-100 text-green-800'
                              : mobile.pta_approval_status === 'not_approve'
                              ? 'bg-orange-100 text-orange-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {getPTAApprovalLabel(mobile.pta_approval_status)}
                        </span>
                      </td>
                    )}
                    {visibleColumns.condition && (
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getConditionColor(mobile.condition)}`}>
                          {getConditionLabel(mobile.condition)}
                        </span>
                      </td>
                    )}
                    {visibleColumns.cost_price && <td className="px-6 py-4 text-sm font-semibold text-gray-900">Rs. {typeof mobile.cost_price === 'number' ? mobile.cost_price.toLocaleString('en-PK') : mobile.cost_price}</td>}
                    {visibleColumns.sale_price && <td className="px-6 py-4 text-sm font-semibold text-green-600">Rs. {typeof mobile.sale_price === 'number' ? mobile.sale_price.toLocaleString('en-PK') : mobile.sale_price}</td>}
                    {visibleColumns.imei1 && <td className="px-6 py-4 text-sm text-gray-700 font-mono">{mobile.imei1 || 'N/A'}</td>}
                    {visibleColumns.imei2 && <td className="px-6 py-4 text-sm text-gray-700 font-mono">{mobile.imei2 || 'N/A'}</td>}
                    {visibleColumns.serial_number && <td className="px-6 py-4 text-sm text-gray-700">{mobile.serial_number || 'N/A'}</td>}
                    {visibleColumns.sim_time && <td className="px-6 py-4 text-sm text-gray-700">{mobile.sim_time || 'N/A'}</td>}
                    {visibleColumns.received_date && <td className="px-6 py-4 text-sm text-gray-700">{mobile.received_date ? new Date(mobile.received_date).toLocaleDateString() : 'N/A'}</td>}
                    <td className="px-6 py-4 text-sm">
                      <button
                        onClick={() => handleViewMobile(mobile)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold text-sm"
                      >
                        👁️ View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mobile Detail Modal */}
      <Modal
        isOpen={showDetailModal}
        title={selectedMobile ? `${selectedMobile.brand} ${selectedMobile.model}` : 'Mobile Details'}
        subtitle={selectedMobile ? `ID: ${selectedMobile.id}` : ''}
        onClose={() => {
          setShowDetailModal(false);
          setIsEditing(false);
        }}
        size="xl"
      >
        {selectedMobile && (
          <div className="space-y-6">
            {/* Mobile Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-xs text-gray-600 mb-1">Brand</p>
                <p className="font-semibold text-lg text-gray-900">{selectedMobile.brand}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-xs text-gray-600 mb-1">Model</p>
                <p className="font-semibold text-lg text-gray-900">{selectedMobile.model}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-xs text-gray-600 mb-1">Storage</p>
                <p className="font-semibold text-lg text-gray-900">{selectedMobile.storage}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-xs text-gray-600 mb-1">Color</p>
                <p className="font-semibold text-lg text-gray-900">{selectedMobile.color}</p>
              </div>
            </div>

            {/* IMEI Information */}
            <div className="border-l-4 border-blue-500 bg-blue-50 p-4 rounded-lg">
              <p className="text-sm font-semibold text-gray-900 mb-3">IMEI Information</p>
              <div className="space-y-2 text-sm">
                <p><span className="text-gray-600">IMEI 1:</span> <span className="font-mono font-semibold">{selectedMobile.imei1}</span></p>
                <p><span className="text-gray-600">IMEI 2:</span> <span className="font-mono font-semibold">{selectedMobile.imei2}</span></p>
                {selectedMobile.imei3 !== 'N/A' && <p><span className="text-gray-600">IMEI 3:</span> <span className="font-mono font-semibold">{selectedMobile.imei3}</span></p>}
              </div>
            </div>

            {/* Condition & Pricing */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-xs text-gray-600 mb-1">Condition</p>
                <p className="font-semibold capitalize text-lg text-gray-900">{selectedMobile.condition}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-xs text-gray-600 mb-1">Cost Price</p>
                <p className="font-semibold text-lg text-gray-900">Rs. {selectedMobile.cost_price?.toLocaleString('en-PK')}</p>
              </div>
            </div>

            {/* Editable Fields */}
            <div className="border-t-2 pt-4 space-y-4">
              <p className="font-semibold text-gray-900">Editable Information</p>

              {/* Sale Price */}
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-2">Sale Price (Rs.)</label>
                {isEditing ? (
                  <input
                    type="number"
                    value={editData.sale_price === 'N/A' ? '' : editData.sale_price}
                    onChange={(e) => setEditData({ ...editData, sale_price: e.target.value ? parseFloat(e.target.value) : 'N/A' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="text-gray-700 font-semibold">Rs. {typeof editData.sale_price === 'number' ? editData.sale_price?.toLocaleString('en-PK') : editData.sale_price}</p>
                )}
              </div>

              {/* Serial Number */}
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-2">Serial Number</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editData.serial_number === 'N/A' ? '' : editData.serial_number}
                    onChange={(e) => setEditData({ ...editData, serial_number: e.target.value || 'N/A' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="text-gray-700 font-mono">{editData.serial_number}</p>
                )}
              </div>

              {/* PTA Approval Status */}
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-2">PTA Approval Status</label>
                {isEditing ? (
                  <select
                    value={editData.pta_approval_status}
                    onChange={(e) => setEditData({ ...editData, pta_approval_status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="approve">Approved</option>
                    <option value="not_approve">Not Approved</option>
                  </select>
                ) : (
                  <p className="text-gray-700 font-semibold">
                    {editData.pta_approval_status === 'approve' ? '✓ Approved' : '✗ Not Approved'}
                  </p>
                )}
              </div>

              {/* SIM Time (for not_approve) */}
              {editData.pta_approval_status === 'not_approve' && (
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-2">SIM Time Duration</label>
                  {isEditing ? (
                    <select
                      value={editData.sim_time === 'N/A' ? '' : editData.sim_time}
                      onChange={(e) => setEditData({ ...editData, sim_time: e.target.value || 'N/A' })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select SIM Duration</option>
                      <option value="1 month">1 Month</option>
                      <option value="3 months">3 Months</option>
                      <option value="6 months">6 Months</option>
                      <option value="12 months">12 Months</option>
                    </select>
                  ) : (
                    <p className="text-gray-700">{editData.sim_time}</p>
                  )}
                </div>
              )}

              {/* Damaged */}
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-2">Damaged</label>
                {isEditing ? (
                  <select
                    value={editData.is_damaged ? 'yes' : 'no'}
                    onChange={(e) => setEditData({ ...editData, is_damaged: e.target.value === 'yes' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                ) : (
                  <p className="text-gray-700 font-semibold">{editData.is_damaged ? '✗ Yes' : '✓ No'}</p>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-2">Notes</label>
                {isEditing ? (
                  <textarea
                    value={editData.notes || ''}
                    onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="text-gray-700 whitespace-pre-wrap">{editData.notes || 'No notes'}</p>
                )}
              </div>
            </div>

            {/* CNIC Information */}
            <div className="border-t-2 pt-4 space-y-4">
              <p className="font-semibold text-gray-900">CNIC Information</p>

              {/* CNIC Number */}
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-2">CNIC Number</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editData.cnic_number === 'N/A' ? '' : editData.cnic_number}
                    onChange={(e) => setEditData({ ...editData, cnic_number: e.target.value || 'N/A' })}
                    placeholder="12345-1234567-1"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <p className="text-gray-700 font-mono">{editData.cnic_number}</p>
                )}
              </div>

              {/* CNIC Front Image */}
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-2">CNIC Front Image</label>
                {editData.cnic_front_image && editData.cnic_front_image !== 'N/A' && (
                  <div className="mb-3">
                    <img
                      src={editData.cnic_front_image}
                      alt="CNIC Front"
                      className="w-full max-w-xs h-auto rounded-lg border border-gray-300"
                    />
                  </div>
                )}
                {isEditing && (
                  <input
                    type="text"
                    value={editData.cnic_front_image === 'N/A' || !editData.cnic_front_image ? '' : editData.cnic_front_image}
                    onChange={(e) => setEditData({ ...editData, cnic_front_image: e.target.value || 'N/A' })}
                    placeholder="Paste image URL or file path"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>

              {/* CNIC Back Image */}
              <div>
                <label className="text-sm font-semibold text-gray-700 block mb-2">CNIC Back Image</label>
                {editData.cnic_back_image && editData.cnic_back_image !== 'N/A' && (
                  <div className="mb-3">
                    <img
                      src={editData.cnic_back_image}
                      alt="CNIC Back"
                      className="w-full max-w-xs h-auto rounded-lg border border-gray-300"
                    />
                  </div>
                )}
                {isEditing && (
                  <input
                    type="text"
                    value={editData.cnic_back_image === 'N/A' || !editData.cnic_back_image ? '' : editData.cnic_back_image}
                    onChange={(e) => setEditData({ ...editData, cnic_back_image: e.target.value || 'N/A' })}
                    placeholder="Paste image URL or file path"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>
            </div>

            {/* Mobile Images */}
            <div className="border-t-2 pt-4 space-y-4">
              <p className="font-semibold text-gray-900">Mobile Images</p>

              {/* Display Existing Mobile Images */}
              {editData.mobile_images && editData.mobile_images !== 'N/A' && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {(() => {
                    try {
                      const images = JSON.parse(editData.mobile_images);
                      return images.map((img, idx) => (
                        <div key={idx} className="relative">
                          <img
                            src={img}
                            alt={`Mobile ${idx + 1}`}
                            className="w-full h-32 object-cover rounded-lg border border-gray-300"
                          />
                          {isEditing && (
                            <button
                              onClick={() => {
                                const images = JSON.parse(editData.mobile_images);
                                images.splice(idx, 1);
                                setEditData({ ...editData, mobile_images: JSON.stringify(images) });
                              }}
                              className="absolute top-2 right-2 bg-red-600 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold hover:bg-red-700"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ));
                    } catch (e) {
                      return <p className="text-gray-600">No valid images</p>;
                    }
                  })()}
                </div>
              )}

              {/* Add Mobile Images */}
              {isEditing && (
                <div>
                  <label className="text-sm font-semibold text-gray-700 block mb-2">Add Image URL (Paste one URL at a time)</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      id="imageUrlInput"
                      placeholder="Paste image URL"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => {
                        const input = document.getElementById('imageUrlInput');
                        if (input.value.trim()) {
                          try {
                            const images = editData.mobile_images && editData.mobile_images !== 'N/A'
                              ? JSON.parse(editData.mobile_images)
                              : [];
                            images.push(input.value.trim());
                            setEditData({ ...editData, mobile_images: JSON.stringify(images) });
                            input.value = '';
                          } catch (e) {
                            alert('Error adding image. Make sure mobile_images is valid JSON array.');
                          }
                        }
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                    >
                      Add
                    </button>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">💡 You can paste image URLs from cloud services like Imgur, Google Drive, or Cloudinary</p>
                </div>
              )}
            </div>

            {/* Metadata */}
            <div className="bg-gray-50 p-4 rounded-lg text-xs space-y-2 text-gray-600">
              <p><span className="font-semibold">Created:</span> {new Date(selectedMobile.created_at).toLocaleString('en-PK')}</p>
              <p><span className="font-semibold">Updated:</span> {new Date(selectedMobile.updated_at).toLocaleString('en-PK')}</p>
              <p><span className="font-semibold">Received:</span> {new Date(selectedMobile.received_date).toLocaleDateString('en-PK')}</p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              {!isEditing ? (
                <>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex-1 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-semibold"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={handleDeleteMobile}
                    disabled={loading}
                    className="flex-1 px-4 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold disabled:bg-gray-400"
                  >
                    {loading ? '🗑️ Deleting...' : '🗑️ Delete'}
                  </button>
                  <button
                    onClick={() => setShowDetailModal(false)}
                    className="flex-1 px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-semibold"
                  >
                    Close
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleEditMobile}
                    disabled={loading}
                    className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold disabled:bg-gray-400"
                  >
                    {loading ? '💾 Saving...' : '💾 Save Changes'}
                  </button>
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setEditData(selectedMobile);
                    }}
                    className="flex-1 px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-semibold"
                  >
                    ✕ Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ViewStock;
