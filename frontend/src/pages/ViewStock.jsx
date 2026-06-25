// View Mobile Stock Page - With filtering by Brand, Model, PTA Status, Color
import React, { useState, useEffect } from 'react';
import BilingualLabel from '../components/BilingualLabel';
import BilingualButton from '../components/BilingualButton';
import BilingualAlert from '../components/BilingualAlert';
import { mobileAPI, brandsAPI, modelsAPI, colorAPI } from '../services/api';

const ViewStock = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [mobileStock, setMobileStock] = useState([]);
  const [showColumnSelector, setShowColumnSelector] = useState(false);

  // Filter States
  const [filters, setFilters] = useState({
    brand_id: '',
    model_id: '',
    pta_status: '', // PTA, NON_PTA, or empty for both
    color_id: '',
    condition: '', // new, patched, used, or empty for all
  });

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState({
    id: true,
    brand: true,
    model: true,
    storage: true,
    color: true,
    pta_status: true,
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

  // Load models when brand changes
  useEffect(() => {
    if (filters.brand_id) {
      loadModelsByBrand();
    } else {
      setModels([]);
      setFilters((prev) => ({ ...prev, model_id: '' }));
    }
  }, [filters.brand_id]);

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

  const loadModelsByBrand = async () => {
    try {
      const res = await modelsAPI.getByBrand(filters.brand_id);
      if (res.success) {
        setModels(res.data || []);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const loadStock = async () => {
    try {
      // Fetch all mobiles with IN_STOCK status
      const res = await mobileAPI.getAll('IN_STOCK');

      if (res.success) {
        let filtered = res.data || [];

        // Apply filters
        if (filters.brand_id) {
          filtered = filtered.filter(
            (mobile) => mobile.model?.brand_id === parseInt(filters.brand_id)
          );
        }

        if (filters.model_id) {
          filtered = filtered.filter(
            (mobile) => mobile.model_id === parseInt(filters.model_id)
          );
        }

        if (filters.pta_status) {
          filtered = filtered.filter(
            (mobile) => mobile.pta_status === filters.pta_status
          );
        }

        if (filters.color_id) {
          filtered = filtered.filter(
            (mobile) => mobile.color_id === parseInt(filters.color_id)
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
      brand_id: '',
      model_id: '',
      pta_status: '',
      color_id: '',
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
      pta_status: true,
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
        return 'Box Pack';
      case 'patched':
        return 'Patched';
      case 'used':
        return 'Used';
      default:
        return condition;
    }
  };

  const getPTALabel = (pta_status) => {
    return pta_status === 'PTA' ? '✓ PTA' : '✗ Non-PTA';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Brand Filter */}
          <div>
            <BilingualLabel en="Brand" ur="برانڈ" size="sm" bold={true} className="mb-2" />
            <select
              value={filters.brand_id}
              onChange={(e) => handleFilterChange('brand_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Brands</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </div>

          {/* Model Filter */}
          <div>
            <BilingualLabel en="Model" ur="ماڈل" size="sm" bold={true} className="mb-2" />
            <select
              value={filters.model_id}
              onChange={(e) => handleFilterChange('model_id', e.target.value)}
              disabled={!filters.brand_id}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            >
              <option value="">All Models</option>
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.model_name}
                </option>
              ))}
            </select>
          </div>

          {/* PTA Status Filter */}
          <div>
            <BilingualLabel en="PTA Status" ur="PTA کی حالت" size="sm" bold={true} className="mb-2" />
            <select
              value={filters.pta_status}
              onChange={(e) => handleFilterChange('pta_status', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All</option>
              <option value="PTA">✓ PTA Approved</option>
              <option value="NON_PTA">✗ Non-PTA</option>
            </select>
          </div>

          {/* Color Filter */}
          <div>
            <BilingualLabel en="Color" ur="رنگ" size="sm" bold={true} className="mb-2" />
            <select
              value={filters.color_id}
              onChange={(e) => handleFilterChange('color_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Colors</option>
              {colors.map((color) => (
                <option key={color.id} value={color.id}>
                  {color.name}
                </option>
              ))}
            </select>
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
                  {visibleColumns.pta_status && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">PTA Status</th>}
                  {visibleColumns.condition && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Condition</th>}
                  {visibleColumns.cost_price && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Cost Price</th>}
                  {visibleColumns.sale_price && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Sale Price</th>}
                  {visibleColumns.imei1 && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">IMEI1</th>}
                  {visibleColumns.imei2 && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">IMEI2</th>}
                  {visibleColumns.serial_number && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Serial #</th>}
                  {visibleColumns.sim_time && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">SIM Time</th>}
                  {visibleColumns.received_date && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Received</th>}
                </tr>
              </thead>
              <tbody>
                {mobileStock.map((mobile, index) => (
                  <tr
                    key={mobile.id}
                    className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                  >
                    {visibleColumns.id && <td className="px-6 py-4 text-sm text-gray-900 font-medium">{mobile.id}</td>}
                    {visibleColumns.brand && <td className="px-6 py-4 text-sm text-gray-700">{mobile.model?.brand?.name || 'N/A'}</td>}
                    {visibleColumns.model && <td className="px-6 py-4 text-sm text-gray-700">{mobile.model?.model_name || 'N/A'}</td>}
                    {visibleColumns.storage && <td className="px-6 py-4 text-sm text-gray-700">{mobile.storage?.name || 'N/A'}</td>}
                    {visibleColumns.color && <td className="px-6 py-4 text-sm text-gray-700">{mobile.color?.name || 'N/A'}</td>}
                    {visibleColumns.pta_status && (
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`px-3 py-1 rounded-full text-sm font-semibold ${
                            mobile.pta_status === 'PTA'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-orange-100 text-orange-800'
                          }`}
                        >
                          {getPTALabel(mobile.pta_status)}
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
                    {visibleColumns.cost_price && <td className="px-6 py-4 text-sm font-semibold text-gray-900">Rs. {mobile.cost_price?.toLocaleString('en-PK')}</td>}
                    {visibleColumns.sale_price && <td className="px-6 py-4 text-sm font-semibold text-green-600">Rs. {mobile.sale_price?.toLocaleString('en-PK')}</td>}
                    {visibleColumns.imei1 && <td className="px-6 py-4 text-sm text-gray-700 font-mono">{mobile.imei1 || 'N/A'}</td>}
                    {visibleColumns.imei2 && <td className="px-6 py-4 text-sm text-gray-700 font-mono">{mobile.imei2 || 'N/A'}</td>}
                    {visibleColumns.serial_number && <td className="px-6 py-4 text-sm text-gray-700">{mobile.serial_number || 'N/A'}</td>}
                    {visibleColumns.sim_time && <td className="px-6 py-4 text-sm text-gray-700">{mobile.sim_time || 'N/A'}</td>}
                    {visibleColumns.received_date && <td className="px-6 py-4 text-sm text-gray-700">{new Date(mobile.received_date).toLocaleDateString()}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ViewStock;
