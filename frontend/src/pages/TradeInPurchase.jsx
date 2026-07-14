// Trade-In Purchase Page - 6-step trade-in purchase process with photo and CNIC capture
import React, { useState, useEffect } from 'react';
import BilingualLabel from '../components/BilingualLabel';
import BilingualButton from '../components/BilingualButton';
import BilingualAlert from '../components/BilingualAlert';
import BilingualInput from '../components/BilingualInput';
import BackButton from '../components/BackButton';
import Modal from '../components/Modal';
import { partiesAPI, mobileAPI, transactionsAPI, brandsAPI, modelsAPI } from '../services/api';

const TradeInPurchase = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);

  // Camera and file upload refs
  const cnicFrontCameraRef = React.useRef(null);
  const cnicFrontFileRef = React.useRef(null);
  const cnicBackCameraRef = React.useRef(null);
  const cnicBackFileRef = React.useRef(null);
  const photosCameraRef = React.useRef(null);
  const photosFileRef = React.useRef(null);

  // Form Data - All 6 steps
  const [formData, setFormData] = useState({
    // Step 1: Supplier
    supplier_id: '',
    // Step 2: CNIC
    cnic_number: '',
    cnic_front_photo: '',
    cnic_back_photo: '',
    // Step 3: Photos (optional)
    photos: [],
    // Step 4: Device Details
    brand_id: '',
    model_id: '',
    imei1: '',
    imei2: '',
    imei3: '',
    condition: 'used',
    patch_details: '',
    pta_status: 'locked',
    // Step 5: Pricing & Payment
    purchase_price: '',
    payment_method: 'cash',
    amount_paid: '',
    transaction_notes: '',
    // Additional
    transaction_date: new Date().toISOString().split('T')[0],
  });

  // New Supplier Form
  const [newSupplier, setNewSupplier] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    notes: '',
  });

  // Dropdowns & Data
  const [suppliers, setSuppliers] = useState([]);
  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [cnicFrontPhotoPreview, setCnicFrontPhotoPreview] = useState(null);
  const [cnicBackPhotoPreview, setCnicBackPhotoPreview] = useState(null);

  // Load initial data
  useEffect(() => {
    loadInitialData();
  }, []);

  // Load models when brand changes
  useEffect(() => {
    if (formData.brand_id) {
      loadModelsByBrand(formData.brand_id);
    }
  }, [formData.brand_id]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [suppliersRes, brandsRes] = await Promise.all([
        partiesAPI.getSuppliers(),
        brandsAPI.getAll(),
      ]);

      if (suppliersRes.success) {
        setSuppliers(suppliersRes.data || []);
      }

      if (brandsRes.success) {
        setBrands(brandsRes.data || []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadModelsByBrand = async (brandId) => {
    try {
      const res = await modelsAPI.getByBrand(brandId);
      if (res.success) {
        setModels(res.data || []);
      }
    } catch (err) {
      console.error('Error loading models:', err);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    // Set selected supplier for display
    if (field === 'supplier_id') {
      const supplier = suppliers.find(s => s.id.toString() === value);
      if (supplier) {
        setSelectedSupplier(supplier);
      }
    }

    // Reset model when brand changes
    if (field === 'brand_id') {
      setFormData((prev) => ({ ...prev, model_id: '' }));
    }
  };

  const handleAddSupplier = async () => {
    if (!newSupplier.name || !newSupplier.phone) {
      setError('Name and phone are required');
      return;
    }

    setLoading(true);
    try {
      const res = await partiesAPI.create({
        name: newSupplier.name,
        phone: newSupplier.phone,
        email: newSupplier.email || null,
        address: newSupplier.address || null,
        city: newSupplier.city || null,
        notes: newSupplier.notes || null,
        type: 'SUPPLIER',
        is_active: true,
      });

      if (res.success) {
        setSuppliers([...suppliers, res.data]);
        setFormData((prev) => ({ ...prev, supplier_id: res.data.id.toString() }));
        setSelectedSupplier(res.data);
        setShowAddSupplierModal(false);
        setNewSupplier({
          name: '',
          phone: '',
          email: '',
          address: '',
          city: '',
          notes: '',
        });
        setSuccess('Supplier added successfully!');
        setTimeout(() => setSuccess(false), 3000);
      } else {
        setError(res.error || 'Failed to add supplier');
      }
    } catch (err) {
      setError(err.message || 'Failed to add supplier');
    } finally {
      setLoading(false);
    }
  };

  // Photo upload handlers
  const handlePhotoCapture = (e) => {
    const files = Array.from(e.target.files);

    if (formData.photos.length + files.length > 4) {
      setError('Maximum 4 photos allowed');
      return;
    }

    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target.result;
        setFormData((prev) => ({
          ...prev,
          photos: [...prev.photos, { url: base64, timestamp: new Date().toISOString(), angle: '' }]
        }));
        setPhotoPreviews((prev) => [...prev, base64]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (index) => {
    setFormData((prev) => ({
      ...prev,
      photos: prev.photos.filter((_, i) => i !== index)
    }));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  // CNIC photo handler for front
  const handleCnicFrontPhotoCapture = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target.result;
        setFormData((prev) => ({ ...prev, cnic_front_photo: base64 }));
        setCnicFrontPhotoPreview(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  // CNIC photo handler for back
  const handleCnicBackPhotoCapture = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target.result;
        setFormData((prev) => ({ ...prev, cnic_back_photo: base64 }));
        setCnicBackPhotoPreview(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  // CNIC auto-format: converts "123451234567 1" to "12345-1234567-1"
  const formatCnicNumber = (value) => {
    // Remove all non-digit characters
    const digitsOnly = value.replace(/\D/g, '');

    // Limit to 13 digits (5 + 7 + 1)
    const limited = digitsOnly.slice(0, 13);

    // Format with dashes
    if (limited.length <= 5) {
      return limited;
    } else if (limited.length <= 12) {
      return `${limited.slice(0, 5)}-${limited.slice(5)}`;
    } else {
      return `${limited.slice(0, 5)}-${limited.slice(5, 12)}-${limited.slice(12)}`;
    }
  };

  // CNIC validation
  const validateCnicFormat = (cnic) => {
    const cnicRegex = /^\d{5}-\d{7}-\d{1}$/;
    return cnicRegex.test(cnic);
  };

  const validateStep = (step) => {
    switch (step) {
      case 1:
        return formData.supplier_id;
      case 2:
        return formData.cnic_number && validateCnicFormat(formData.cnic_number);
      case 3:
        // Photos are optional
        return true;
      case 4:
        return formData.brand_id && formData.model_id && formData.imei1 && formData.imei2 && formData.condition && formData.pta_status;
      case 5:
        return formData.purchase_price && formData.payment_method && formData.amount_paid;
      case 6:
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, 6));
      setError(null);
    } else {
      setError('Please complete all required fields');
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
    setError(null);
  };

  const handleSubmit = async () => {
    if (!validateStep(6)) {
      setError('Invalid data. Please review all steps.');
      return;
    }

    setLoading(true);
    try {
      // Call the quick trade-in endpoint with all parameters
      const res = await transactionsAPI.quickTradeIn(
        parseInt(formData.supplier_id),
        parseInt(formData.brand_id),
        parseInt(formData.model_id),
        formData.imei1,
        formData.imei2,
        formData.imei3 || null,
        formData.condition,
        formData.patch_details || null,
        formData.pta_status,
        formData.cnic_number,
        formData.cnic_photo_url || null,
        formData.photos.map(p => p.url),
        parseFloat(formData.purchase_price),
        formData.payment_method,
        parseFloat(formData.amount_paid),
        formData.transaction_date,
        formData.transaction_notes || null
      );

      if (res.success) {
        setSuccess(true);
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
      } else {
        setError(res.error || 'Failed to complete trade-in purchase');
      }
    } catch (err) {
      setError(err.message || 'Failed to complete trade-in purchase');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Back Button */}
      <div className="mb-6">
        <BackButton fallbackPath="/" />
      </div>

      {/* Header */}
      <div className="mb-8">
        <BilingualLabel
          en="Trade-in Purchase"
          ur="ٹریڈ ان خریداری"
          size="2xl"
          bold={true}
          color="text-gray-900"
        />
        <p className="text-gray-600 mt-2">Complete the trade-in purchase in 6 simple steps</p>
      </div>

      {/* Alerts */}
      {error && (
        <BilingualAlert
          en={error}
          ur={error}
          type="error"
          onClose={() => setError(null)}
        />
      )}
      {success && (
        <BilingualAlert
          en="Trade-in purchase completed successfully! Redirecting..."
          ur="ٹریڈ ان خریداری کامیابی سے مکمل ہو گئی!"
          type="success"
          onClose={() => setSuccess(false)}
        />
      )}

      {/* Progress Indicator */}
      <div className="mb-8">
        <StepProgressIndicator currentStep={currentStep} totalSteps={6} />
      </div>

      {/* Step Content */}
      <div className="card max-w-2xl">
        {currentStep === 1 && (
          <Step1SupplierSelection
            formData={formData}
            suppliers={suppliers}
            onInputChange={handleInputChange}
            onAddNew={() => setShowAddSupplierModal(true)}
          />
        )}
        {currentStep === 2 && (
          <Step2CnicCapture
            formData={formData}
            onInputChange={handleInputChange}
            onCameraCaptureFront={handleCnicFrontPhotoCapture}
            onCameraCapureBack={handleCnicBackPhotoCapture}
            onClearPhotoFront={() => setCnicFrontPhotoPreview(null)}
            onClearPhotoBack={() => setCnicBackPhotoPreview(null)}
            cnicFrontCameraRef={cnicFrontCameraRef}
            cnicFrontFileRef={cnicFrontFileRef}
            cnicBackCameraRef={cnicBackCameraRef}
            cnicBackFileRef={cnicBackFileRef}
            cnicFrontPhotoPreview={cnicFrontPhotoPreview}
            cnicBackPhotoPreview={cnicBackPhotoPreview}
            validateCnicFormat={validateCnicFormat}
            formatCnicNumber={formatCnicNumber}
          />
        )}
        {currentStep === 3 && (
          <Step3PhotoUpload
            formData={formData}
            photoPreviews={photoPreviews}
            onCameraCapture={handlePhotoCapture}
            photosCameraRef={photosCameraRef}
            photosFileRef={photosFileRef}
            onRemovePhoto={removePhoto}
          />
        )}
        {currentStep === 4 && (
          <Step4DeviceDetails
            formData={formData}
            brands={brands}
            models={models}
            onInputChange={handleInputChange}
          />
        )}
        {currentStep === 5 && (
          <Step5PricingPayment
            formData={formData}
            onInputChange={handleInputChange}
          />
        )}
        {currentStep === 6 && (
          <Step6Summary
            formData={formData}
            suppliers={suppliers}
            brands={brands}
            models={models}
            photoPreviews={photoPreviews}
          />
        )}

        {/* Navigation Buttons */}
        <div className="flex gap-4 mt-8">
          <BilingualButton
            en="Back"
            ur="پیچھے"
            variant="secondary"
            size="md"
            onClick={handleBack}
            disabled={currentStep === 1}
          />

          {currentStep < 6 ? (
            <BilingualButton
              en="Next"
              ur="اگلا"
              variant="primary"
              size="md"
              onClick={handleNext}
              loading={loading}
            />
          ) : (
            <BilingualButton
              en="Complete Trade-in"
              ur="ٹریڈ ان مکمل کریں"
              variant="success"
              size="md"
              onClick={handleSubmit}
              loading={loading}
            />
          )}
        </div>
      </div>

      {/* Add Supplier Modal */}
      <Modal
        isOpen={showAddSupplierModal}
        title="Add New Supplier"
        subtitle="Create a new supplier to proceed with trade-in"
        onClose={() => setShowAddSupplierModal(false)}
        size="lg"
      >
        <div className="space-y-4">
          <BilingualInput
            en="Name"
            ur="نام"
            type="text"
            value={newSupplier.name}
            onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
            required={true}
            icon="👤"
          />
          <BilingualInput
            en="Phone"
            ur="فون"
            type="tel"
            value={newSupplier.phone}
            onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
            required={true}
            icon="📱"
          />
          <BilingualInput
            en="Email"
            ur="ای میل"
            type="email"
            value={newSupplier.email}
            onChange={(e) => setNewSupplier({ ...newSupplier, email: e.target.value })}
            icon="📧"
          />
          <BilingualInput
            en="Address"
            ur="پتہ"
            type="text"
            value={newSupplier.address}
            onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })}
            icon="🏠"
          />
          <BilingualInput
            en="City"
            ur="شہر"
            type="text"
            value={newSupplier.city}
            onChange={(e) => setNewSupplier({ ...newSupplier, city: e.target.value })}
            icon="🏙️"
          />
          <BilingualInput
            en="Notes"
            ur="نوٹس"
            type="text"
            value={newSupplier.notes}
            onChange={(e) => setNewSupplier({ ...newSupplier, notes: e.target.value })}
            icon="📝"
          />

          <div className="flex gap-4 mt-6">
            <button
              onClick={() => setShowAddSupplierModal(false)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddSupplier}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400"
            >
              {loading ? 'Adding...' : 'Add Supplier'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// Step 1: Supplier Selection
const Step1SupplierSelection = ({ formData, suppliers, onInputChange, onAddNew }) => {
  const [searchTerm, setSearchTerm] = React.useState('');

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.phone.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <BilingualLabel
        en="Select Supplier/Customer"
        ur="سپلائی کار منتخب کریں"
        size="lg"
        bold={true}
        className="mb-4"
      />

      <div>
        <BilingualLabel
          en="Search or select supplier"
          ur="سپلائی کار تلاش یا منتخب کریں"
          size="md"
          bold={true}
          className="mb-2"
        />
        <input
          type="text"
          placeholder="Search by name or phone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 mb-3"
        />
        <select
          value={formData.supplier_id}
          onChange={(e) => onInputChange('supplier_id', e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        >
          <option value="">-- Select a supplier --</option>
          {filteredSuppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name} ({supplier.phone}) - Balance: Rs. {supplier.amount_due || 0}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-4">
        <p className="text-gray-600 text-sm">Don't have a supplier?</p>
        <button
          onClick={onAddNew}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          Add New Supplier
        </button>
      </div>
    </div>
  );
};

// Step 2: CNIC Capture
const Step2CnicCapture = ({
  formData,
  onInputChange,
  onCameraCaptureFront,
  onCameraCapureBack,
  onClearPhotoFront,
  onClearPhotoBack,
  cnicFrontCameraRef,
  cnicFrontFileRef,
  cnicBackCameraRef,
  cnicBackFileRef,
  cnicFrontPhotoPreview,
  cnicBackPhotoPreview,
  validateCnicFormat,
  formatCnicNumber
}) => {
  const isCnicValid = formData.cnic_number ? validateCnicFormat(formData.cnic_number) : false;

  const handleCameraClickFront = () => {
    cnicFrontCameraRef.current?.click();
  };

  const handleFileClickFront = () => {
    cnicFrontFileRef.current?.click();
  };

  const handleCameraClickBack = () => {
    cnicBackCameraRef.current?.click();
  };

  const handleFileClickBack = () => {
    cnicBackFileRef.current?.click();
  };

  const handleRemovePhotoFront = () => {
    onInputChange('cnic_front_photo', '');
    onClearPhotoFront();
    if (cnicFrontCameraRef.current) cnicFrontCameraRef.current.value = '';
    if (cnicFrontFileRef.current) cnicFrontFileRef.current.value = '';
  };

  const handleRemovePhotoBack = () => {
    onInputChange('cnic_back_photo', '');
    onClearPhotoBack();
    if (cnicBackCameraRef.current) cnicBackCameraRef.current.value = '';
    if (cnicBackFileRef.current) cnicBackFileRef.current.value = '';
  };

  return (
    <div className="space-y-6">
      <BilingualLabel
        en="Capture CNIC"
        ur="CNIC کیپچر کریں"
        size="lg"
        bold={true}
        className="mb-4"
      />

      <div>
        <BilingualLabel
          en="CNIC Number"
          ur="CNIC نمبر"
          size="md"
          bold={true}
          className="mb-2"
        />
        <input
          type="text"
          placeholder="Enter CNIC: 12345 1234567 1"
          value={formData.cnic_number}
          onChange={(e) => {
            const formatted = formatCnicNumber(e.target.value);
            onInputChange('cnic_number', formatted);
          }}
          maxLength="15"
          className={`w-full px-4 py-3 border rounded-lg focus:outline-none transition-colors font-mono tracking-wider ${
            formData.cnic_number && !isCnicValid
              ? 'border-red-500 bg-red-50 focus:border-red-600'
              : 'border-gray-300 focus:border-blue-500'
          }`}
        />
        {formData.cnic_number && !isCnicValid && (
          <p className="text-red-600 text-sm mt-2">Invalid format. Use: 12345-1234567-1</p>
        )}
        {isCnicValid && (
          <p className="text-green-600 text-sm mt-2">✓ Valid CNIC format</p>
        )}
      </div>

      {/* CNIC Front Photo */}
      <div className="border-t pt-6">
        <BilingualLabel
          en="CNIC Front (Optional)"
          ur="CNIC کا آگے والا حصہ (اختیاری)"
          size="md"
          bold={true}
          className="mb-4"
        />

        {cnicFrontPhotoPreview ? (
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <img
                src={cnicFrontPhotoPreview}
                alt="CNIC Front"
                className="max-w-xs max-h-60 border-2 border-green-500 rounded-lg shadow-sm"
              />
              <div className="absolute top-2 right-2 bg-green-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                ✓ Uploaded
              </div>
            </div>
            <p className="text-gray-500 text-sm">Only one CNIC front image allowed</p>
            <button
              type="button"
              onClick={handleRemovePhotoFront}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
            >
              ✕ Remove & Re-upload
            </button>
          </div>
        ) : (
          <div className="flex gap-4">
            <button
              type="button"
              onClick={handleCameraClickFront}
              className="flex-1 px-4 py-3 border-2 border-dashed border-blue-300 rounded-lg cursor-pointer hover:border-blue-600 hover:bg-blue-50 transition-colors text-center active:bg-blue-100"
            >
              <div className="flex flex-col items-center gap-2">
                <span className="text-2xl">📷</span>
                <span className="text-gray-600 font-medium">Take Photo</span>
                <span className="text-gray-400 text-xs">(Camera)</span>
              </div>
            </button>

            <button
              type="button"
              onClick={handleFileClickFront}
              className="flex-1 px-4 py-3 border-2 border-dashed border-blue-300 rounded-lg cursor-pointer hover:border-blue-600 hover:bg-blue-50 transition-colors text-center active:bg-blue-100"
            >
              <div className="flex flex-col items-center gap-2">
                <span className="text-2xl">🖼️</span>
                <span className="text-gray-600 font-medium">Upload Photo</span>
                <span className="text-gray-400 text-xs">(One Only)</span>
              </div>
            </button>

            {/* Hidden camera input - Front */}
            <input
              ref={cnicFrontCameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onCameraCaptureFront}
              className="hidden"
              aria-label="Capture CNIC front with camera"
            />

            {/* Hidden file input - Front */}
            <input
              ref={cnicFrontFileRef}
              type="file"
              accept="image/*"
              onChange={onCameraCaptureFront}
              className="hidden"
              aria-label="Upload CNIC front from gallery"
            />
          </div>
        )}
      </div>

      {/* CNIC Back Photo */}
      <div className="border-t pt-6">
        <BilingualLabel
          en="CNIC Back (Optional)"
          ur="CNIC کا پچھلا حصہ (اختیاری)"
          size="md"
          bold={true}
          className="mb-4"
        />

        {cnicBackPhotoPreview ? (
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <img
                src={cnicBackPhotoPreview}
                alt="CNIC Back"
                className="max-w-xs max-h-60 border-2 border-green-500 rounded-lg shadow-sm"
              />
              <div className="absolute top-2 right-2 bg-green-500 text-white px-3 py-1 rounded-full text-sm font-medium">
                ✓ Uploaded
              </div>
            </div>
            <p className="text-gray-500 text-sm">Only one CNIC back image allowed</p>
            <button
              type="button"
              onClick={handleRemovePhotoBack}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
            >
              ✕ Remove & Re-upload
            </button>
          </div>
        ) : (
          <div className="flex gap-4">
            <button
              type="button"
              onClick={handleCameraClickBack}
              className="flex-1 px-4 py-3 border-2 border-dashed border-purple-300 rounded-lg cursor-pointer hover:border-purple-600 hover:bg-purple-50 transition-colors text-center active:bg-purple-100"
            >
              <div className="flex flex-col items-center gap-2">
                <span className="text-2xl">📷</span>
                <span className="text-gray-600 font-medium">Take Photo</span>
                <span className="text-gray-400 text-xs">(Camera)</span>
              </div>
            </button>

            <button
              type="button"
              onClick={handleFileClickBack}
              className="flex-1 px-4 py-3 border-2 border-dashed border-purple-300 rounded-lg cursor-pointer hover:border-purple-600 hover:bg-purple-50 transition-colors text-center active:bg-purple-100"
            >
              <div className="flex flex-col items-center gap-2">
                <span className="text-2xl">🖼️</span>
                <span className="text-gray-600 font-medium">Upload Photo</span>
                <span className="text-gray-400 text-xs">(One Only)</span>
              </div>
            </button>

            {/* Hidden camera input - Back */}
            <input
              ref={cnicBackCameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onCameraCapureBack}
              className="hidden"
              aria-label="Capture CNIC back with camera"
            />

            {/* Hidden file input - Back */}
            <input
              ref={cnicBackFileRef}
              type="file"
              accept="image/*"
              onChange={onCameraCapureBack}
              className="hidden"
              aria-label="Upload CNIC back from gallery"
            />
          </div>
        )}
      </div>
    </div>
  );
};

// Step 3: Photo Upload
const Step3PhotoUpload = ({ formData, photoPreviews, onCameraCapture, photosCameraRef, photosFileRef, onRemovePhoto }) => {
  const handleCameraClick = () => {
    photosCameraRef.current?.click();
  };

  const handleFileClick = () => {
    photosFileRef.current?.click();
  };

  return (
    <div className="space-y-6">
      <BilingualLabel
        en="Add Device Photos"
        ur="ڈیوائس کی تصاویر شامل کریں"
        size="lg"
        bold={true}
        className="mb-4"
      />

      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
        <p className="text-gray-700 text-sm font-medium">
          📸 Take photos from different angles (front, back, sides)
        </p>
        <p className="text-gray-600 text-xs mt-1">
          • Maximum 4 photos allowed
          • Click "Upload Photo" to select multiple images at once
          • This step is optional but recommended
        </p>
      </div>

      {photoPreviews.length > 0 && (
        <div>
          <BilingualLabel
            en="Photos Added"
            ur="شامل کی گئی تصاویر"
            size="md"
            bold={true}
            className="mb-4"
          />
          <div className="grid grid-cols-2 gap-4">
            {photoPreviews.map((preview, index) => (
              <div key={index} className="relative">
                <img
                  src={preview}
                  alt={`Photo ${index + 1}`}
                  className="w-full h-40 object-cover border rounded-lg"
                />
                <button
                  onClick={() => onRemovePhoto(index)}
                  className="absolute top-2 right-2 p-1 bg-red-600 text-white rounded-full hover:bg-red-700 transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {photoPreviews.length < 4 && (
        <div className="flex gap-4">
          <button
            type="button"
            onClick={handleCameraClick}
            className="flex-1 px-4 py-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors text-center active:bg-blue-100"
          >
            <div className="flex flex-col items-center gap-2">
              <span className="text-3xl">📷</span>
              <span className="text-gray-600 font-medium">Take Photo</span>
              <span className="text-gray-400 text-xs">({photoPreviews.length}/4) Camera</span>
            </div>
          </button>

          <button
            type="button"
            onClick={handleFileClick}
            className="flex-1 px-4 py-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors text-center active:bg-blue-100"
          >
            <div className="flex flex-col items-center gap-2">
              <span className="text-3xl">🖼️</span>
              <span className="text-gray-600 font-medium">Select Photos</span>
              <span className="text-gray-400 text-xs">({photoPreviews.length}/4) Multiple OK</span>
            </div>
          </button>

          {/* Hidden camera input */}
          <input
            ref={photosCameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onCameraCapture}
            className="hidden"
            aria-label="Capture device photo with camera"
          />

          {/* Hidden file input */}
          <input
            ref={photosFileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={onCameraCapture}
            className="hidden"
            aria-label="Upload device photos from gallery"
          />
        </div>
      )}
    </div>
  );
};

// Step 4: Device Details
const Step4DeviceDetails = ({ formData, brands, models, onInputChange }) => {
  return (
    <div className="space-y-6">
      <BilingualLabel
        en="Device Details"
        ur="ڈیوائس کی تفصیلات"
        size="lg"
        bold={true}
        className="mb-4"
      />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <BilingualLabel
            en="Brand"
            ur="برانڈ"
            size="md"
            bold={true}
            className="mb-2"
          />
          <select
            value={formData.brand_id}
            onChange={(e) => onInputChange('brand_id', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
          >
            <option value="">-- Select Brand --</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <BilingualLabel
            en="Model"
            ur="ماڈل"
            size="md"
            bold={true}
            className="mb-2"
          />
          <select
            value={formData.model_id}
            onChange={(e) => onInputChange('model_id', e.target.value)}
            disabled={!formData.brand_id}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 disabled:bg-gray-100"
          >
            <option value="">-- Select Model --</option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.model_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-4">
        <BilingualLabel
          en="IMEI Numbers"
          ur="IMEI نمبرز"
          size="md"
          bold={true}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">IMEI 1 (Required)</label>
          <input
            type="text"
            value={formData.imei1}
            onChange={(e) => onInputChange('imei1', e.target.value)}
            placeholder="15 digits"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">IMEI 2 (Required)</label>
          <input
            type="text"
            value={formData.imei2}
            onChange={(e) => onInputChange('imei2', e.target.value)}
            placeholder="15 digits"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">IMEI 3 (Optional)</label>
          <input
            type="text"
            value={formData.imei3}
            onChange={(e) => onInputChange('imei3', e.target.value)}
            placeholder="15 digits (optional)"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <BilingualLabel
            en="Condition"
            ur="حالت"
            size="md"
            bold={true}
            className="mb-2"
          />
          <select
            value={formData.condition}
            onChange={(e) => onInputChange('condition', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
          >
            <option value="new">New</option>
            <option value="used">Used</option>
            <option value="patched">Patched</option>
          </select>
        </div>

        <div>
          <BilingualLabel
            en="PTA Status"
            ur="PTA سٹیٹس"
            size="md"
            bold={true}
            className="mb-2"
          />
          <select
            value={formData.pta_status}
            onChange={(e) => onInputChange('pta_status', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
          >
            <option value="locked">Locked</option>
            <option value="unlocked">Unlocked</option>
            <option value="approved">Approved</option>
          </select>
        </div>
      </div>

      {formData.condition === 'patched' && (
        <div>
          <BilingualLabel
            en="Patch Details"
            ur="پیچ کی تفصیلات"
            size="md"
            bold={true}
            className="mb-2"
          />
          <input
            type="text"
            value={formData.patch_details}
            onChange={(e) => onInputChange('patch_details', e.target.value)}
            placeholder="Describe the patch applied"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
          />
        </div>
      )}
    </div>
  );
};

// Step 5: Pricing & Payment
const Step5PricingPayment = ({ formData, onInputChange }) => {
  return (
    <div className="space-y-6">
      <BilingualLabel
        en="Pricing & Payment"
        ur="قیمت اور ادائیگی"
        size="lg"
        bold={true}
        className="mb-4"
      />

      <div>
        <BilingualLabel
          en="Purchase Price (Amount to pay supplier)"
          ur="خریداری کی قیمت"
          size="md"
          bold={true}
          className="mb-2"
        />
        <input
          type="number"
          value={formData.purchase_price}
          onChange={(e) => {
            const val = e.target.value;
            if (val === '' || parseFloat(val) >= 0) {
              onInputChange('purchase_price', val);
            }
          }}
          placeholder="Enter purchase price"
          className={`w-full px-4 py-3 border rounded-lg focus:outline-none ${
            formData.purchase_price && parseFloat(formData.purchase_price) < 0
              ? 'border-red-300 bg-red-50'
              : 'border-gray-300 focus:border-blue-500'
          }`}
        />
        {formData.purchase_price && parseFloat(formData.purchase_price) < 0 && (
          <p className="text-red-600 text-sm mt-1">⚠️ Purchase price cannot be negative</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <BilingualLabel
            en="Payment Method"
            ur="ادائیگی کا طریقہ"
            size="md"
            bold={true}
            className="mb-2"
          />
          <select
            value={formData.payment_method}
            onChange={(e) => onInputChange('payment_method', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
          >
            <option value="cash">Cash</option>
            <option value="cheque">Cheque</option>
            <option value="transfer">Bank Transfer</option>
          </select>
        </div>

        <div>
          <BilingualLabel
            en="Amount Paid"
            ur="ادا شدہ رقم"
            size="md"
            bold={true}
            className="mb-2"
          />
          <input
            type="number"
            value={formData.amount_paid}
            onChange={(e) => {
              const val = e.target.value;
              if (val === '' || parseFloat(val) >= 0) {
                onInputChange('amount_paid', val);
              }
            }}
            placeholder="Enter amount paid"
            className={`w-full px-4 py-3 border rounded-lg focus:outline-none ${
              formData.amount_paid && parseFloat(formData.amount_paid) < 0
                ? 'border-red-300 bg-red-50'
                : 'border-gray-300 focus:border-blue-500'
            }`}
          />
          {formData.amount_paid && parseFloat(formData.amount_paid) < 0 && (
            <p className="text-red-600 text-sm mt-1">⚠️ Amount paid cannot be negative</p>
          )}
        </div>
      </div>

      {formData.purchase_price && formData.amount_paid && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-sm font-medium text-gray-700 mb-2">Payment Summary:</div>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Purchase Price:</span>
              <span>Rs. {parseFloat(formData.purchase_price || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span>Amount Paid:</span>
              <span>Rs. {parseFloat(formData.amount_paid || 0).toLocaleString()}</span>
            </div>
            <div className={`flex justify-between pt-2 border-t font-semibold ${
              parseFloat(formData.amount_paid) < parseFloat(formData.purchase_price)
                ? 'text-red-600'
                : parseFloat(formData.amount_paid) > parseFloat(formData.purchase_price)
                ? 'text-green-600'
                : 'text-gray-700'
            }`}>
              <span>Balance:</span>
              <span>
                {parseFloat(formData.amount_paid) < parseFloat(formData.purchase_price)
                  ? `Still owe: Rs. ${(parseFloat(formData.purchase_price) - parseFloat(formData.amount_paid)).toLocaleString()}`
                  : parseFloat(formData.amount_paid) > parseFloat(formData.purchase_price)
                  ? `Refund: Rs. ${(parseFloat(formData.amount_paid) - parseFloat(formData.purchase_price)).toLocaleString()}`
                  : 'No balance'}
              </span>
            </div>
          </div>
        </div>
      )}

      <div>
        <BilingualLabel
          en="Notes (Optional)"
          ur="نوٹس (اختیاری)"
          size="md"
          bold={true}
          className="mb-2"
        />
        <textarea
          value={formData.transaction_notes}
          onChange={(e) => onInputChange('transaction_notes', e.target.value)}
          placeholder="Add any additional notes..."
          rows="4"
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
        />
      </div>
    </div>
  );
};

// Step 6: Summary & Confirmation
const Step6Summary = ({ formData, suppliers, brands, models, photoPreviews }) => {
  const supplier = suppliers.find(s => s.id.toString() === formData.supplier_id);
  const brand = brands.find(b => b.id.toString() === formData.brand_id);
  const model = models.find(m => m.id.toString() === formData.model_id);

  return (
    <div className="space-y-6">
      <BilingualLabel
        en="Review & Confirm"
        ur="جائزہ اور تصدیق"
        size="lg"
        bold={true}
        className="mb-4"
      />

      <div className="space-y-6">
        {/* Supplier Info */}
        <div className="p-4 bg-gray-50 rounded-lg border">
          <BilingualLabel
            en="Supplier Information"
            ur="سپلائی کار کی معلومات"
            size="md"
            bold={true}
            className="mb-3"
          />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Name:</span>
              <span className="font-medium">{supplier?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Phone:</span>
              <span className="font-medium">{supplier?.phone}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">CNIC:</span>
              <span className="font-medium">{formData.cnic_number}</span>
            </div>
          </div>
        </div>

        {/* Device Info */}
        <div className="p-4 bg-gray-50 rounded-lg border">
          <BilingualLabel
            en="Device Information"
            ur="ڈیوائس کی معلومات"
            size="md"
            bold={true}
            className="mb-3"
          />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Brand:</span>
              <span className="font-medium">{brand?.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Model:</span>
              <span className="font-medium">{model?.model_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Condition:</span>
              <span className="font-medium capitalize">{formData.condition}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">PTA Status:</span>
              <span className="font-medium capitalize">{formData.pta_status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">IMEI 1:</span>
              <span className="font-medium">{formData.imei1}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">IMEI 2:</span>
              <span className="font-medium">{formData.imei2}</span>
            </div>
            {formData.imei3 && (
              <div className="flex justify-between">
                <span className="text-gray-600">IMEI 3:</span>
                <span className="font-medium">{formData.imei3}</span>
              </div>
            )}
          </div>
        </div>

        {/* Photos */}
        {photoPreviews.length > 0 && (
          <div className="p-4 bg-gray-50 rounded-lg border">
            <BilingualLabel
              en="Device Photos"
              ur="ڈیوائس کی تصاویر"
              size="md"
              bold={true}
              className="mb-3"
            />
            <div className="grid grid-cols-2 gap-4">
              {photoPreviews.map((preview, index) => (
                <img
                  key={index}
                  src={preview}
                  alt={`Photo ${index + 1}`}
                  className="w-full h-32 object-cover border rounded-lg"
                />
              ))}
            </div>
          </div>
        )}

        {/* Payment Info */}
        <div className="p-4 bg-gray-50 rounded-lg border">
          <BilingualLabel
            en="Payment Information"
            ur="ادائیگی کی معلومات"
            size="md"
            bold={true}
            className="mb-3"
          />
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Purchase Price:</span>
              <span className="font-medium">Rs. {parseFloat(formData.purchase_price || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Payment Method:</span>
              <span className="font-medium capitalize">{formData.payment_method}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Amount Paid:</span>
              <span className="font-medium">Rs. {parseFloat(formData.amount_paid || 0).toLocaleString()}</span>
            </div>
            <div className={`flex justify-between pt-2 border-t font-semibold ${
              parseFloat(formData.amount_paid) < parseFloat(formData.purchase_price)
                ? 'text-red-600'
                : parseFloat(formData.amount_paid) > parseFloat(formData.purchase_price)
                ? 'text-green-600'
                : 'text-gray-700'
            }`}>
              <span>Balance:</span>
              <span>
                {parseFloat(formData.amount_paid) < parseFloat(formData.purchase_price)
                  ? `Owe: Rs. ${(parseFloat(formData.purchase_price) - parseFloat(formData.amount_paid)).toLocaleString()}`
                  : parseFloat(formData.amount_paid) > parseFloat(formData.purchase_price)
                  ? `Refund: Rs. ${(parseFloat(formData.amount_paid) - parseFloat(formData.purchase_price)).toLocaleString()}`
                  : 'Settled'}
              </span>
            </div>
          </div>
        </div>

        {formData.transaction_notes && (
          <div className="p-4 bg-gray-50 rounded-lg border">
            <BilingualLabel
              en="Notes"
              ur="نوٹس"
              size="md"
              bold={true}
              className="mb-2"
            />
            <p className="text-sm text-gray-700">{formData.transaction_notes}</p>
          </div>
        )}
      </div>

      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-gray-700">
          ✓ Please review all information above. Click "Complete Trade-in" to finalize this purchase.
        </p>
      </div>
    </div>
  );
};

// Step Progress Indicator
const StepProgressIndicator = ({ currentStep, totalSteps }) => {
  const steps = ['Supplier', 'CNIC', 'Photos', 'Device', 'Payment', 'Confirm'];

  return (
    <div className="flex items-center gap-2">
      {steps.slice(0, totalSteps).map((step, index) => (
        <React.Fragment key={index}>
          <div
            className={`flex items-center justify-center w-10 h-10 rounded-full font-semibold transition-all ${
              index + 1 < currentStep
                ? 'bg-green-600 text-white'
                : index + 1 === currentStep
                ? 'bg-blue-600 text-white ring-4 ring-blue-200'
                : 'bg-gray-300 text-gray-700'
            }`}
          >
            {index + 1 < currentStep ? '✓' : index + 1}
          </div>
          {index < totalSteps - 1 && (
            <div
              className={`flex-1 h-1 ${
                index + 1 < currentStep ? 'bg-green-600' : 'bg-gray-300'
              }`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

export default TradeInPurchase;
