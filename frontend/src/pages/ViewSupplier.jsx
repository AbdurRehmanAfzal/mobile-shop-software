// View Supplier Page - With detailed supplier information and filtering
import React, { useState, useEffect } from 'react';
import BilingualLabel from '../components/BilingualLabel';
import BilingualButton from '../components/BilingualButton';
import BilingualAlert from '../components/BilingualAlert';
import Modal from '../components/Modal';
import { partiesAPI } from '../services/api';

const ViewSupplier = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Filter states
  const [filters, setFilters] = useState({
    minBalance: '',
    maxBalance: '',
    city: '',
    status: 'active', // active, inactive, all
  });

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState({
    id: true,
    name: true,
    phone: true,
    email: true,
    city: true,
    address: false,
    contact_person: false,
    credit_balance: true,
    total_purchased: true,
    total_paid: true,
    is_active: true,
    created_at: false,
    updated_at: false,
  });

  // Load suppliers on mount
  useEffect(() => {
    loadSuppliers();
  }, []);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const res = await partiesAPI.getSuppliers();
      if (res.success) {
        setSuppliers(res.data || []);
      } else {
        setError(res.error || 'Failed to load suppliers');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
      name: true,
      phone: true,
      email: true,
      city: true,
      address: false,
      contact_person: false,
      credit_balance: true,
      total_purchased: true,
      total_paid: true,
      is_active: true,
      created_at: false,
      updated_at: false,
    });
  };

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const resetFilters = () => {
    setFilters({
      minBalance: '',
      maxBalance: '',
      city: '',
      status: 'active',
    });
    setSearchTerm('');
  };

  // Filter suppliers based on search and filters
  const filteredSuppliers = suppliers.filter((supplier) => {
    // Search filter
    if (
      searchTerm &&
      !supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !supplier.phone.includes(searchTerm)
    ) {
      return false;
    }

    // City filter
    if (filters.city && supplier.city !== filters.city) {
      return false;
    }

    // Status filter
    if (filters.status === 'active' && !supplier.is_active) {
      return false;
    }
    if (filters.status === 'inactive' && supplier.is_active) {
      return false;
    }

    // Balance filters
    const balance = supplier.credit_balance || 0;
    if (filters.minBalance && balance < parseFloat(filters.minBalance)) {
      return false;
    }
    if (filters.maxBalance && balance > parseFloat(filters.maxBalance)) {
      return false;
    }

    return true;
  });

  const uniqueCities = [...new Set(suppliers.map((s) => s.city).filter(Boolean))].sort();
  const totalSuppliers = suppliers.length;
  const activeSuppliers = suppliers.filter((s) => s.is_active).length;
  const totalDue = suppliers.reduce((sum, s) => sum + (s.credit_balance || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      {/* Header */}
      <div className="mb-8">
        <BilingualLabel
          en="Supplier Management"
          ur="سپلائی کار کی مینجمنٹ"
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

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <BilingualLabel en="Total Suppliers" ur="کل سپلائی کار" size="sm" bold={true} className="mb-2" />
          <p className="text-3xl font-bold text-blue-600">{totalSuppliers}</p>
          <p className="text-sm text-blue-600 mt-1">{activeSuppliers} active</p>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <BilingualLabel en="Amount Due" ur="واجب الدفع رقم" size="sm" bold={true} className="mb-2" />
          <p className="text-3xl font-bold text-red-600">Rs. {totalDue.toLocaleString('en-PK')}</p>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <BilingualLabel en="Filtered Results" ur="فلٹر شدہ نتائج" size="sm" bold={true} className="mb-2" />
          <p className="text-3xl font-bold text-purple-600">{filteredSuppliers.length}</p>
        </div>
      </div>

      {/* Column Selector */}
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
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
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

      {/* Search and Filter Section */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <BilingualLabel
          en="Search & Filter"
          ur="تلاش اور فلٹر"
          size="lg"
          bold={true}
          className="mb-6"
        />

        <div className="space-y-4">
          {/* Search */}
          <div>
            <BilingualLabel en="Search" ur="تلاش" size="sm" bold={true} className="mb-2" />
            <input
              type="text"
              placeholder="Search by name or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Filters Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* City Filter */}
            <div>
              <BilingualLabel en="City" ur="شہر" size="sm" bold={true} className="mb-2" />
              <select
                value={filters.city}
                onChange={(e) => handleFilterChange('city', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              >
                <option value="">All Cities</option>
                {uniqueCities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Filter */}
            <div>
              <BilingualLabel en="Status" ur="حالت" size="sm" bold={true} className="mb-2" />
              <select
                value={filters.status}
                onChange={(e) => handleFilterChange('status', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {/* Min Balance */}
            <div>
              <BilingualLabel en="Min Due" ur="کم واجب" size="sm" bold={true} className="mb-2" />
              <input
                type="number"
                placeholder="Min amount due..."
                value={filters.minBalance}
                onChange={(e) => handleFilterChange('minBalance', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Max Balance */}
            <div>
              <BilingualLabel en="Max Due" ur="زیادہ واجب" size="sm" bold={true} className="mb-2" />
              <input
                type="number"
                placeholder="Max amount due..."
                value={filters.maxBalance}
                onChange={(e) => handleFilterChange('maxBalance', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Reset Button */}
          <BilingualButton
            en="Reset Filters"
            ur="فلٹرز صاف کریں"
            variant="secondary"
            size="md"
            onClick={resetFilters}
          />
        </div>
      </div>

      {/* Suppliers Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {filteredSuppliers.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500 text-lg">No suppliers found matching your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 border-b border-gray-200">
                <tr>
                  {visibleColumns.id && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">ID</th>}
                  {visibleColumns.name && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Name</th>}
                  {visibleColumns.phone && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Phone</th>}
                  {visibleColumns.email && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Email</th>}
                  {visibleColumns.city && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">City</th>}
                  {visibleColumns.address && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Address</th>}
                  {visibleColumns.contact_person && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Contact Person</th>}
                  {visibleColumns.credit_balance && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Amount Due</th>}
                  {visibleColumns.total_purchased && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Supplied</th>}
                  {visibleColumns.total_paid && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Paid</th>}
                  {visibleColumns.is_active && <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>}
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredSuppliers.map((supplier, index) => (
                  <tr
                    key={supplier.id}
                    className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}
                  >
                    {visibleColumns.id && <td className="px-6 py-4 text-sm text-gray-900 font-medium">{supplier.id}</td>}
                    {visibleColumns.name && <td className="px-6 py-4 text-sm text-gray-700 font-semibold">{supplier.name}</td>}
                    {visibleColumns.phone && <td className="px-6 py-4 text-sm text-gray-700">{supplier.phone}</td>}
                    {visibleColumns.email && <td className="px-6 py-4 text-sm text-gray-700">{supplier.email || 'N/A'}</td>}
                    {visibleColumns.city && <td className="px-6 py-4 text-sm text-gray-700">{supplier.city || 'N/A'}</td>}
                    {visibleColumns.address && <td className="px-6 py-4 text-sm text-gray-700">{supplier.address || 'N/A'}</td>}
                    {visibleColumns.contact_person && <td className="px-6 py-4 text-sm text-gray-700">{supplier.contact_person || 'N/A'}</td>}
                    {visibleColumns.credit_balance && (
                      <td className="px-6 py-4 text-sm font-semibold">
                        <span className={supplier.credit_balance > 0 ? 'text-red-600' : 'text-green-600'}>
                          Rs. {Math.abs(supplier.credit_balance || 0).toLocaleString('en-PK')}
                        </span>
                      </td>
                    )}
                    {visibleColumns.total_purchased && <td className="px-6 py-4 text-sm text-gray-700">Rs. {(supplier.total_purchased || 0).toLocaleString('en-PK')}</td>}
                    {visibleColumns.total_paid && <td className="px-6 py-4 text-sm text-gray-700">Rs. {(supplier.total_paid || 0).toLocaleString('en-PK')}</td>}
                    {visibleColumns.is_active && (
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                          supplier.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {supplier.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    )}
                    <td className="px-6 py-4 text-sm">
                      <button
                        onClick={() => setSelectedSupplier(supplier)}
                        className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Supplier Detail Modal */}
      {selectedSupplier && (
        <Modal
          isOpen={true}
          title={selectedSupplier.name}
          subtitle="Supplier Details"
          onClose={() => setSelectedSupplier(null)}
          size="lg"
        >
          <div className="space-y-6">
            {/* Contact Information */}
            <div>
              <BilingualLabel
                en="Contact Information"
                ur="رابطہ کی معلومات"
                size="md"
                bold={true}
                className="mb-4"
              />
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm text-gray-600">Phone</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedSupplier.phone}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Email</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedSupplier.email || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">WhatsApp</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedSupplier.whatsapp || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Contact Person</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedSupplier.contact_person || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* Address Information */}
            <div>
              <BilingualLabel
                en="Address"
                ur="پتہ"
                size="md"
                bold={true}
                className="mb-4"
              />
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm text-gray-600">City</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedSupplier.city || 'N/A'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-gray-600">Address</p>
                  <p className="text-lg font-semibold text-gray-900">{selectedSupplier.address || 'N/A'}</p>
                </div>
              </div>
            </div>

            {/* Financial Information */}
            <div>
              <BilingualLabel
                en="Financial Summary"
                ur="مالیاتی خلاصہ"
                size="md"
                bold={true}
                className="mb-4"
              />
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-600">Total Supplied</p>
                  <p className="text-2xl font-bold text-blue-900">Rs. {(selectedSupplier.total_purchased || 0).toLocaleString('en-PK')}</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-sm text-green-600">Total Paid</p>
                  <p className="text-2xl font-bold text-green-900">Rs. {(selectedSupplier.total_paid || 0).toLocaleString('en-PK')}</p>
                </div>
                <div className={`p-4 rounded-lg border-2 col-span-2 ${
                  selectedSupplier.credit_balance > 0
                    ? 'bg-red-50 border-red-200'
                    : 'bg-green-50 border-green-200'
                }`}>
                  <p className={`text-sm ${selectedSupplier.credit_balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {selectedSupplier.credit_balance > 0 ? 'Amount Due' : 'Overpaid'}
                  </p>
                  <p className={`text-3xl font-bold ${selectedSupplier.credit_balance > 0 ? 'text-red-900' : 'text-green-900'}`}>
                    Rs. {Math.abs(selectedSupplier.credit_balance || 0).toLocaleString('en-PK')}
                  </p>
                </div>
              </div>
            </div>

            {/* Status and Dates */}
            <div>
              <BilingualLabel
                en="Account Details"
                ur="اکاؤنٹ کی تفصیلات"
                size="md"
                bold={true}
                className="mb-4"
              />
              <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm text-gray-600">Status</p>
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold mt-1 ${
                    selectedSupplier.is_active
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {selectedSupplier.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Since</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {new Date(selectedSupplier.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Notes */}
            {selectedSupplier.notes && (
              <div>
                <BilingualLabel
                  en="Notes"
                  ur="نوٹس"
                  size="md"
                  bold={true}
                  className="mb-4"
                />
                <p className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-gray-900">
                  {selectedSupplier.notes}
                </p>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ViewSupplier;
