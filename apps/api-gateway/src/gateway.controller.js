"use strict";
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = exports.QuizController = exports.ProcessingController = exports.CdnController = exports.HealthController = void 0;
var common_1 = require("@nestjs/common");
var platform_express_1 = require("@nestjs/platform-express");
var rxjs_1 = require("rxjs");
var swagger_1 = require("@nestjs/swagger");
var jwt_auth_guard_1 = require("./jwt/jwt-auth.guard");
var common_2 = require("@repo/common");
// =========================================================================
// === HEALTHCHECK ===
// =========================================================================
var HealthController = function () {
    var _classDecorators = [(0, swagger_1.ApiTags)('Health'), (0, common_1.Controller)('health')];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _instanceExtraInitializers = [];
    var _healthCheck_decorators;
    var HealthController = _classThis = /** @class */ (function () {
        function HealthController_1() {
            __runInitializers(this, _instanceExtraInitializers);
        }
        HealthController_1.prototype.healthCheck = function () {
            return 'OK';
        };
        return HealthController_1;
    }());
    __setFunctionName(_classThis, "HealthController");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _healthCheck_decorators = [(0, common_1.Get)(), (0, swagger_1.ApiOperation)({ summary: 'Gateway application health check' })];
        __esDecorate(_classThis, null, _healthCheck_decorators, { kind: "method", name: "healthCheck", static: false, private: false, access: { has: function (obj) { return "healthCheck" in obj; }, get: function (obj) { return obj.healthCheck; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        HealthController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return HealthController = _classThis;
}();
exports.HealthController = HealthController;
// =========================================================================
// === CDN CONTROLLER ===
// =========================================================================
var CdnController = function () {
    var _classDecorators = [(0, swagger_1.ApiTags)('CDN'), (0, swagger_1.ApiBearerAuth)(), (0, common_1.Controller)('cdn')];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _instanceExtraInitializers = [];
    var _healthCheck_decorators;
    var _createClass_decorators;
    var _uploadFiles_decorators;
    var _getClasses_decorators;
    var _getTopicsForClass_decorators;
    var CdnController = _classThis = /** @class */ (function () {
        function CdnController_1(httpService) {
            this.httpService = (__runInitializers(this, _instanceExtraInitializers), httpService);
            this.logger = new common_1.Logger(CdnController.name);
        }
        CdnController_1.prototype.healthCheck = function () { return 'OK'; };
        CdnController_1.prototype.createClass = function (body, req) {
            return __awaiter(this, void 0, void 0, function () {
                var user, cdnUrl, payload, response, error_1;
                var _a, _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            user = req.user;
                            cdnUrl = "".concat(process.env.CDN_URL, "/cdn/create-class");
                            payload = {
                                userId: user.userId,
                                className: body.className,
                                examDate: body.examDate,
                                examLocation: body.examLocation
                            };
                            _c.label = 1;
                        case 1:
                            _c.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, (0, rxjs_1.firstValueFrom)(this.httpService.post(cdnUrl, payload))];
                        case 2:
                            response = _c.sent();
                            return [2 /*return*/, response.data];
                        case 3:
                            error_1 = _c.sent();
                            throw new common_1.BadRequestException(((_b = (_a = error_1.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.message) || 'Failed to create class');
                        case 4: return [2 /*return*/];
                    }
                });
            });
        };
        CdnController_1.prototype.uploadFiles = function (files, body, req) {
            return __awaiter(this, void 0, void 0, function () {
                var user, payload, cdnUrl, response, error_2;
                var _a, _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            user = req.user;
                            if (!files || files.length === 0)
                                throw new common_1.BadRequestException('No files uploaded');
                            if (!body.className)
                                throw new common_1.BadRequestException('Class name is required');
                            payload = files.map(function (file) { return ({
                                filename: file.originalname,
                                content: file.buffer.toString('base64'),
                                userId: user.userId,
                                className: body.className,
                            }); });
                            cdnUrl = "".concat(process.env.CDN_URL, "/cdn/upload");
                            _c.label = 1;
                        case 1:
                            _c.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, (0, rxjs_1.firstValueFrom)(this.httpService.post(cdnUrl, payload))];
                        case 2:
                            response = _c.sent();
                            return [2 /*return*/, response.data];
                        case 3:
                            error_2 = _c.sent();
                            this.logger.error("Upload failed: ".concat(error_2.message));
                            throw new common_1.BadRequestException(((_b = (_a = error_2.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.message) || 'Upload failed');
                        case 4: return [2 /*return*/];
                    }
                });
            });
        };
        CdnController_1.prototype.getClasses = function (req) {
            return __awaiter(this, void 0, void 0, function () {
                var user, cdnUrl, response, error_3;
                var _a, _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            user = req.user;
                            cdnUrl = "".concat(process.env.CDN_URL, "/cdn/user/").concat(user.userId);
                            _c.label = 1;
                        case 1:
                            _c.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, (0, rxjs_1.firstValueFrom)(this.httpService.get(cdnUrl))];
                        case 2:
                            response = _c.sent();
                            return [2 /*return*/, response.data];
                        case 3:
                            error_3 = _c.sent();
                            this.logger.error("Failed to fetch classes: ".concat(error_3.message));
                            throw new common_1.BadRequestException(((_b = (_a = error_3.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.message) || 'Failed to fetch classes');
                        case 4: return [2 /*return*/];
                    }
                });
            });
        };
        CdnController_1.prototype.getTopicsForClass = function (classId, req) {
            return __awaiter(this, void 0, void 0, function () {
                var user, cdnUrl, response, error_4;
                var _a, _b, _c;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0:
                            user = req.user;
                            cdnUrl = "".concat(process.env.CDN_URL, "/cdn/class/").concat(classId, "/topics?userId=").concat(user.userId);
                            _d.label = 1;
                        case 1:
                            _d.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, (0, rxjs_1.firstValueFrom)(this.httpService.get(cdnUrl))];
                        case 2:
                            response = _d.sent();
                            return [2 /*return*/, response.data];
                        case 3:
                            error_4 = _d.sent();
                            if (((_a = error_4.response) === null || _a === void 0 ? void 0 : _a.status) === 403) {
                                throw new common_1.ForbiddenException(error_4.response.data.message);
                            }
                            throw new common_1.BadRequestException(((_c = (_b = error_4.response) === null || _b === void 0 ? void 0 : _b.data) === null || _c === void 0 ? void 0 : _c.message) || 'Failed to fetch topics');
                        case 4: return [2 /*return*/];
                    }
                });
            });
        };
        return CdnController_1;
    }());
    __setFunctionName(_classThis, "CdnController");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _healthCheck_decorators = [(0, common_1.Get)('health'), (0, swagger_1.ApiOperation)({ summary: 'Health check' })];
        _createClass_decorators = [(0, common_1.Post)('create-class'), (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard), (0, swagger_1.ApiOperation)({ summary: 'Create a Class entry in DB' }), (0, swagger_1.ApiBody)({
                schema: {
                    type: 'object',
                    required: ['className'],
                    properties: {
                        className: { type: 'string', example: 'Mathematics 101' },
                        examDate: { type: 'string', format: 'date-time', example: '2025-06-15T09:00:00' },
                        examLocation: { type: 'string', example: 'Room 304' }
                    }
                }
            })];
        _uploadFiles_decorators = [(0, common_1.Post)('upload'), (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard), (0, common_1.UseInterceptors)((0, platform_express_1.FilesInterceptor)('files', 10)), (0, swagger_1.ApiOperation)({ summary: 'Upload files to Class' }), (0, swagger_1.ApiConsumes)('multipart/form-data'), (0, swagger_1.ApiBody)({
                schema: {
                    type: 'object',
                    required: ['className', 'files'],
                    properties: {
                        className: { type: 'string', description: 'The name of the class' },
                        files: {
                            type: 'array',
                            items: { type: 'string', format: 'binary' },
                        },
                    },
                },
            })];
        _getClasses_decorators = [(0, common_1.Get)('classes'), (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard), (0, swagger_1.ApiOperation)({ summary: 'Get list of all classes for the current user' })];
        _getTopicsForClass_decorators = [(0, common_1.Get)('class/:classId/topics'), (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard), (0, swagger_1.ApiOperation)({ summary: 'Get all generated topics for a specific class' })];
        __esDecorate(_classThis, null, _healthCheck_decorators, { kind: "method", name: "healthCheck", static: false, private: false, access: { has: function (obj) { return "healthCheck" in obj; }, get: function (obj) { return obj.healthCheck; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _createClass_decorators, { kind: "method", name: "createClass", static: false, private: false, access: { has: function (obj) { return "createClass" in obj; }, get: function (obj) { return obj.createClass; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _uploadFiles_decorators, { kind: "method", name: "uploadFiles", static: false, private: false, access: { has: function (obj) { return "uploadFiles" in obj; }, get: function (obj) { return obj.uploadFiles; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getClasses_decorators, { kind: "method", name: "getClasses", static: false, private: false, access: { has: function (obj) { return "getClasses" in obj; }, get: function (obj) { return obj.getClasses; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _getTopicsForClass_decorators, { kind: "method", name: "getTopicsForClass", static: false, private: false, access: { has: function (obj) { return "getTopicsForClass" in obj; }, get: function (obj) { return obj.getTopicsForClass; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        CdnController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return CdnController = _classThis;
}();
exports.CdnController = CdnController;
// =========================================================================
// === PROCESSING CONTROLLER ===
// =========================================================================
var ProcessingController = function () {
    var _classDecorators = [(0, swagger_1.ApiTags)('Processing'), (0, swagger_1.ApiBearerAuth)(), (0, common_1.Controller)('processing')];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _instanceExtraInitializers = [];
    var _healthCheck_decorators;
    var _runProcessing_decorators;
    var _mergePdfs_decorators;
    var _splitMergedPdf_decorators;
    var ProcessingController = _classThis = /** @class */ (function () {
        function ProcessingController_1(httpService) {
            this.httpService = (__runInitializers(this, _instanceExtraInitializers), httpService);
            this.logger = new common_1.Logger(ProcessingController.name);
        }
        ProcessingController_1.prototype.healthCheck = function () { return 'OK'; };
        ProcessingController_1.prototype.runProcessing = function (body, req) {
            return __awaiter(this, void 0, void 0, function () {
                var processingUrl, payload, response, error_5;
                var _a, _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            if (!body.classId)
                                throw new common_1.BadRequestException('classId is required');
                            processingUrl = "".concat(process.env.PROCESSING_URL, "/processing/run");
                            payload = { classId: body.classId };
                            _c.label = 1;
                        case 1:
                            _c.trys.push([1, 3, , 4]);
                            this.logger.log("Requesting batch processing for Class ID [".concat(body.classId, "]"));
                            return [4 /*yield*/, (0, rxjs_1.firstValueFrom)(this.httpService.post(processingUrl, payload, {
                                    timeout: 600000,
                                    headers: { 'Content-Type': 'application/json' }
                                }))];
                        case 2:
                            response = _c.sent();
                            return [2 /*return*/, response.data];
                        case 3:
                            error_5 = _c.sent();
                            throw new common_1.BadRequestException(((_b = (_a = error_5.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.message) || 'Processing failed');
                        case 4: return [2 /*return*/];
                    }
                });
            });
        };
        ProcessingController_1.prototype.mergePdfs = function (body, req) {
            return __awaiter(this, void 0, void 0, function () {
                var processingUrl, payload, response, error_6;
                var _a, _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            if (!body.classId)
                                throw new common_1.BadRequestException('classId is required');
                            processingUrl = "".concat(process.env.PROCESSING_URL, "/processing/merge");
                            payload = { classId: body.classId };
                            _c.label = 1;
                        case 1:
                            _c.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, (0, rxjs_1.firstValueFrom)(this.httpService.post(processingUrl, payload, {
                                    timeout: 600000,
                                    headers: { 'Content-Type': 'application/json' }
                                }))];
                        case 2:
                            response = _c.sent();
                            return [2 /*return*/, response.data];
                        case 3:
                            error_6 = _c.sent();
                            throw new common_1.BadRequestException(((_b = (_a = error_6.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.message) || 'Merge failed');
                        case 4: return [2 /*return*/];
                    }
                });
            });
        };
        ProcessingController_1.prototype.splitMergedPdf = function (body, req) {
            return __awaiter(this, void 0, void 0, function () {
                var processingUrl, payload, response, error_7;
                var _a, _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            if (!body.classId)
                                throw new common_1.BadRequestException('classId is required');
                            processingUrl = "".concat(process.env.PROCESSING_URL, "/processing/split");
                            payload = { classId: body.classId };
                            _c.label = 1;
                        case 1:
                            _c.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, (0, rxjs_1.firstValueFrom)(this.httpService.post(processingUrl, payload, {
                                    timeout: 600000,
                                    headers: { 'Content-Type': 'application/json' }
                                }))];
                        case 2:
                            response = _c.sent();
                            return [2 /*return*/, response.data];
                        case 3:
                            error_7 = _c.sent();
                            throw new common_1.BadRequestException(((_b = (_a = error_7.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.message) || 'Split failed');
                        case 4: return [2 /*return*/];
                    }
                });
            });
        };
        return ProcessingController_1;
    }());
    __setFunctionName(_classThis, "ProcessingController");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _healthCheck_decorators = [(0, common_1.Get)('health'), (0, swagger_1.ApiOperation)({ summary: 'Health check' })];
        _runProcessing_decorators = [(0, common_1.Post)('run'), (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard), (0, swagger_1.ApiOperation)({ summary: 'Manually trigger processing for the chosen class' }), (0, swagger_1.ApiBody)({
                schema: {
                    type: 'object',
                    required: ['classId'],
                    properties: {
                        classId: { type: 'string', example: 'uuid-1234-5678', description: 'The UUID of the class returned by upload' }
                    },
                }
            })];
        _mergePdfs_decorators = [(0, common_1.Post)('merge'), (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard), (0, swagger_1.ApiOperation)({ summary: 'Merge PDFs for a Class ID' }), (0, swagger_1.ApiBody)({
                schema: {
                    type: 'object',
                    required: ['classId'],
                    properties: {
                        classId: { type: 'string', example: 'uuid-1234-5678' }
                    },
                }
            })];
        _splitMergedPdf_decorators = [(0, common_1.Post)('split'), (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard), (0, swagger_1.ApiOperation)({ summary: 'Split merged PDF for a Class ID' }), (0, swagger_1.ApiBody)({
                schema: {
                    type: 'object',
                    required: ['classId'],
                    properties: {
                        classId: { type: 'string', example: 'uuid-1234-5678' }
                    },
                }
            })];
        __esDecorate(_classThis, null, _healthCheck_decorators, { kind: "method", name: "healthCheck", static: false, private: false, access: { has: function (obj) { return "healthCheck" in obj; }, get: function (obj) { return obj.healthCheck; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _runProcessing_decorators, { kind: "method", name: "runProcessing", static: false, private: false, access: { has: function (obj) { return "runProcessing" in obj; }, get: function (obj) { return obj.runProcessing; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _mergePdfs_decorators, { kind: "method", name: "mergePdfs", static: false, private: false, access: { has: function (obj) { return "mergePdfs" in obj; }, get: function (obj) { return obj.mergePdfs; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _splitMergedPdf_decorators, { kind: "method", name: "splitMergedPdf", static: false, private: false, access: { has: function (obj) { return "splitMergedPdf" in obj; }, get: function (obj) { return obj.splitMergedPdf; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        ProcessingController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return ProcessingController = _classThis;
}();
exports.ProcessingController = ProcessingController;
// =========================================================================
// === QUIZ CONTROLLER (NEW) ===
// =========================================================================
var QuizController = function () {
    var _classDecorators = [(0, swagger_1.ApiTags)('Quiz'), (0, swagger_1.ApiBearerAuth)(), (0, common_1.Controller)('quiz')];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _instanceExtraInitializers = [];
    var _healthCheck_decorators;
    var _generateQuiz_decorators;
    var QuizController = _classThis = /** @class */ (function () {
        function QuizController_1(httpService) {
            this.httpService = (__runInitializers(this, _instanceExtraInitializers), httpService);
            this.logger = new common_1.Logger(QuizController.name);
        }
        QuizController_1.prototype.healthCheck = function () { return 'OK'; };
        QuizController_1.prototype.generateQuiz = function (body, req) {
            return __awaiter(this, void 0, void 0, function () {
                var quizServiceUrl, payload, response, error_8;
                var _a, _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            if (!body.topicIds || body.topicIds.length === 0) {
                                throw new common_1.BadRequestException('At least one topicId is required');
                            }
                            quizServiceUrl = "".concat(process.env.QUIZ_SERVICE_URL, "/quiz/generate");
                            payload = {
                                mode: body.mode,
                                topicIds: body.topicIds
                            };
                            _c.label = 1;
                        case 1:
                            _c.trys.push([1, 3, , 4]);
                            this.logger.log("Requesting quiz generation [Mode: ".concat(body.mode, "] for ").concat(body.topicIds.length, " topics"));
                            return [4 /*yield*/, (0, rxjs_1.firstValueFrom)(this.httpService.post(quizServiceUrl, payload, {
                                    timeout: 60000, // 60s timeout for AI generation
                                    headers: { 'Content-Type': 'application/json' }
                                }))];
                        case 2:
                            response = _c.sent();
                            return [2 /*return*/, response.data];
                        case 3:
                            error_8 = _c.sent();
                            this.logger.error("Quiz generation failed: ".concat(error_8.message));
                            throw new common_1.BadRequestException(((_b = (_a = error_8.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.message) || 'Failed to generate quiz');
                        case 4: return [2 /*return*/];
                    }
                });
            });
        };
        return QuizController_1;
    }());
    __setFunctionName(_classThis, "QuizController");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _healthCheck_decorators = [(0, common_1.Get)('health'), (0, swagger_1.ApiOperation)({ summary: 'Health check' })];
        _generateQuiz_decorators = [(0, common_1.Post)('generate'), (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard), (0, swagger_1.ApiOperation)({ summary: 'Generate quiz questions based on selected topics' }), (0, swagger_1.ApiBody)({
                schema: {
                    type: 'object',
                    required: ['mode', 'topicIds'],
                    properties: {
                        mode: {
                            type: 'string',
                            enum: ['Quiz', 'Expanded', 'Cards', 'Study'],
                            example: 'Quiz',
                            description: 'Study mode'
                        },
                        topicIds: {
                            type: 'array',
                            items: { type: 'string' },
                            example: ['uuid-topic-1', 'uuid-topic-2'],
                            description: 'Array of Topic UUIDs from the database'
                        }
                    }
                }
            })];
        __esDecorate(_classThis, null, _healthCheck_decorators, { kind: "method", name: "healthCheck", static: false, private: false, access: { has: function (obj) { return "healthCheck" in obj; }, get: function (obj) { return obj.healthCheck; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _generateQuiz_decorators, { kind: "method", name: "generateQuiz", static: false, private: false, access: { has: function (obj) { return "generateQuiz" in obj; }, get: function (obj) { return obj.generateQuiz; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        QuizController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return QuizController = _classThis;
}();
exports.QuizController = QuizController;
// =========================================================================
// === AUTH CONTROLLER ===
// =========================================================================
var AuthController = function () {
    var _classDecorators = [(0, swagger_1.ApiTags)('Auth'), (0, common_1.Controller)('auth')];
    var _classDescriptor;
    var _classExtraInitializers = [];
    var _classThis;
    var _instanceExtraInitializers = [];
    var _healthCheck_decorators;
    var _register_decorators;
    var _login_decorators;
    var AuthController = _classThis = /** @class */ (function () {
        function AuthController_1(httpService) {
            this.httpService = (__runInitializers(this, _instanceExtraInitializers), httpService);
        }
        AuthController_1.prototype.healthCheck = function () {
            return 'OK';
        };
        AuthController_1.prototype.register = function (body) {
            return __awaiter(this, void 0, void 0, function () {
                var userServiceUrl, payload, response, error_9;
                var _a, _b;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            userServiceUrl = "".concat(process.env.AUTH_URL, "/auth/register");
                            payload = {
                                login: body.login,
                                password: body.password
                            };
                            _c.label = 1;
                        case 1:
                            _c.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, (0, rxjs_1.firstValueFrom)(this.httpService.post(userServiceUrl, payload, {
                                    timeout: 600000,
                                    headers: {
                                        'Content-Type': 'application/json',
                                    }
                                }))];
                        case 2:
                            response = _c.sent();
                            return [2 /*return*/, response.data];
                        case 3:
                            error_9 = _c.sent();
                            console.error('Full error details:', {
                                message: error_9.message,
                                response: (_a = error_9.response) === null || _a === void 0 ? void 0 : _a.data,
                                status: (_b = error_9.response) === null || _b === void 0 ? void 0 : _b.status,
                                url: userServiceUrl,
                            });
                            throw new common_1.BadRequestException('Failed to register user');
                        case 4: return [2 /*return*/];
                    }
                });
            });
        };
        AuthController_1.prototype.login = function (body) {
            return __awaiter(this, void 0, void 0, function () {
                var userServiceUrl, payload, response, error_10;
                var _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            userServiceUrl = "".concat(process.env.AUTH_URL, "/auth/login");
                            payload = {
                                login: body.login,
                                password: body.password
                            };
                            _b.label = 1;
                        case 1:
                            _b.trys.push([1, 3, , 4]);
                            return [4 /*yield*/, (0, rxjs_1.firstValueFrom)(this.httpService.post(userServiceUrl, payload, {
                                    timeout: 600000,
                                    headers: {
                                        'Content-Type': 'application/json',
                                    }
                                }))];
                        case 2:
                            response = _b.sent();
                            return [2 /*return*/, response.data];
                        case 3:
                            error_10 = _b.sent();
                            console.error('Login error:', ((_a = error_10.response) === null || _a === void 0 ? void 0 : _a.data) || error_10.message);
                            throw new common_1.BadRequestException('Failed to log in');
                        case 4: return [2 /*return*/];
                    }
                });
            });
        };
        return AuthController_1;
    }());
    __setFunctionName(_classThis, "AuthController");
    (function () {
        var _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
        _healthCheck_decorators = [(0, common_1.Get)('health'), (0, swagger_1.ApiOperation)({ summary: 'Health check' })];
        _register_decorators = [(0, common_1.Post)('register'), (0, swagger_1.ApiOperation)({ summary: 'Register a new user' }), (0, swagger_1.ApiBody)({ type: common_2.AuthDto })];
        _login_decorators = [(0, common_1.Post)('login'), (0, swagger_1.ApiOperation)({ summary: 'Login user' }), (0, swagger_1.ApiBody)({ type: common_2.AuthDto })];
        __esDecorate(_classThis, null, _healthCheck_decorators, { kind: "method", name: "healthCheck", static: false, private: false, access: { has: function (obj) { return "healthCheck" in obj; }, get: function (obj) { return obj.healthCheck; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _register_decorators, { kind: "method", name: "register", static: false, private: false, access: { has: function (obj) { return "register" in obj; }, get: function (obj) { return obj.register; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(_classThis, null, _login_decorators, { kind: "method", name: "login", static: false, private: false, access: { has: function (obj) { return "login" in obj; }, get: function (obj) { return obj.login; } }, metadata: _metadata }, null, _instanceExtraInitializers);
        __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
        AuthController = _classThis = _classDescriptor.value;
        if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        __runInitializers(_classThis, _classExtraInitializers);
    })();
    return AuthController = _classThis;
}();
exports.AuthController = AuthController;
