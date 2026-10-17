package com.bookingnailms.service;

import com.bookingnailms.dto.booking.BookingRequest;
import com.bookingnailms.dto.booking.BookingResponse;
import com.bookingnailms.dto.booking.BookingStatusUpdateRequest;
import com.bookingnailms.dto.booking.WalkInBookingRequest;
import com.bookingnailms.dto.booking.GuestBookingRequest;
import com.bookingnailms.dto.booking.GuestBookingReceipt;
import com.bookingnailms.dto.common.PageResponse;
import com.bookingnailms.entity.Booking;
import com.bookingnailms.entity.Employee;
import com.bookingnailms.entity.NailService;
import com.bookingnailms.entity.Salon;
import com.bookingnailms.entity.User;
import com.bookingnailms.enums.BookingStatus;
import com.bookingnailms.enums.CompletionConfirmation;
import com.bookingnailms.exception.BadRequestException;
import com.bookingnailms.exception.ResourceNotFoundException;
import com.bookingnailms.exception.UnauthorizedException;
import com.bookingnailms.repository.BookingRepository;
import com.bookingnailms.repository.EmployeeRepository;
import com.bookingnailms.repository.NailServiceRepository;
import com.bookingnailms.repository.SalonRepository;
import com.bookingnailms.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.stream.Collectors;
import java.util.UUID;

@Service
public class BookingService {

    private final BookingRepository bookingRepository;
    private final SalonRepository salonRepository;
    private final NailServiceRepository nailServiceRepository;
    private final EmployeeRepository employeeRepository;
    private final UserRepository userRepository;
    private final BookingEmailService bookingEmails;
    private final SalonWorkingHourService workingHours;
    private final Clock clock;

    @Autowired
    public BookingService(BookingRepository bookingRepository, SalonRepository salonRepository,
            NailServiceRepository nailServiceRepository, EmployeeRepository employeeRepository,
            UserRepository userRepository, BookingEmailService bookingEmails,
            SalonWorkingHourService workingHours) {
        this(bookingRepository, salonRepository, nailServiceRepository, employeeRepository,
                userRepository, bookingEmails, workingHours, Clock.systemUTC());
    }

    public BookingService(BookingRepository bookingRepository, SalonRepository salonRepository,
            NailServiceRepository nailServiceRepository, EmployeeRepository employeeRepository,
            UserRepository userRepository, BookingEmailService bookingEmails,
            SalonWorkingHourService workingHours, Clock clock) {
        this.bookingRepository = bookingRepository;
        this.salonRepository = salonRepository;
        this.nailServiceRepository = nailServiceRepository;
        this.employeeRepository = employeeRepository;
        this.userRepository = userRepository;
        this.bookingEmails = bookingEmails;
        this.workingHours = workingHours;
        this.clock = clock;
    }

    public BookingService(BookingRepository bookingRepository, SalonRepository salonRepository,
            NailServiceRepository nailServiceRepository, EmployeeRepository employeeRepository,
            UserRepository userRepository, BookingEmailService bookingEmails) {
        this(bookingRepository, salonRepository, nailServiceRepository, employeeRepository,
                userRepository, bookingEmails, null);
    }

    @Transactional
    public BookingResponse createBooking(BookingRequest request, UUID customerId) {
        User customer = userRepository.findById(customerId)
                .orElseThrow(() -> new ResourceNotFoundException("User", "id", customerId));

        String phone = request.getCustomerPhone();
        if (phone == null || phone.isBlank()) phone = customer.getPhone();
        return create(request, customer, null, phone == null ? null : phone.strip(), null, null);
    }

    @Transactional
    public GuestBookingReceipt createGuestBooking(GuestBookingRequest request) {
        var booking = new BookingRequest(request.salonId(), request.serviceId(), request.employeeId(),
                request.scheduledAt(), request.customerNote());
        var result = create(booking, null, request.fullName().strip(), request.phone().strip(), null, request.email().strip());
        return new GuestBookingReceipt(result.getId(), result.getStatus(), result.getScheduledAt(),
                result.getSalonName(), result.getServiceName());
    }

    @Transactional
    public BookingResponse createWalkIn(WalkInBookingRequest request, UUID ownerId) {
        var salon = salonRepository.findByOwnerId(ownerId)
                .orElseThrow(() -> new ResourceNotFoundException("Salon not found for current owner"));
        var booking = new BookingRequest(salon.getId(), request.serviceId(), request.employeeId(),
                request.scheduledAt(), request.customerNote());
        String name = request.customerName() == null || request.customerName().isBlank()
                ? "Khách vãng lai" : request.customerName().strip();
        return create(booking, null, name, request.customerPhone() == null ? null : request.customerPhone().strip(), ownerId, null);
    }

    private BookingResponse create(BookingRequest request, User customer, String walkInName, String customerPhone, UUID ownerId, String guestEmail) {
        boolean walkIn = ownerId != null;
        // ponytail: serialize booking creation per salon; use per-employee locks if contention grows.
        Salon salon = salonRepository.findForUpdateById(request.getSalonId())
                .orElseThrow(() -> new ResourceNotFoundException("Salon", "id", request.getSalonId()));
        if (ownerId != null && !salon.getOwner().getId().equals(ownerId)) {
            throw new UnauthorizedException("You are not the owner of this salon");
        }
        if (salon.getStatus() != com.bookingnailms.enums.SalonStatus.ACTIVE) {
            throw new BadRequestException("Salon is not accepting bookings");
        }

        NailService nailService = nailServiceRepository.findById(request.getServiceId())
                .orElseThrow(() -> new ResourceNotFoundException("Service", "id", request.getServiceId()));

        if (!nailService.isActive() || !nailService.getSalon().getId().equals(salon.getId())) {
            throw new BadRequestException("Service does not belong to the specified salon");
        }
        if (request.getScheduledAt() == null || nailService.getDurationMinutes() == null
                || nailService.getDurationMinutes() <= 0) {
            throw new BadRequestException("Thời gian hẹn hoặc thời lượng dịch vụ không hợp lệ.");
        }
        if ((walkIn && request.getScheduledAt().getMinute() % 30 != 0) || request.getScheduledAt().getSecond() != 0
                || request.getScheduledAt().getNano() != 0) {
            throw new BadRequestException(walkIn
                    ? "Giờ hẹn cần nằm trên mốc 30 phút." : "Giờ hẹn cần chính xác đến phút.");
        }
        if (!walkIn && request.getScheduledAt().atZone(ZoneId.of("Asia/Ho_Chi_Minh")).toInstant()
                .isBefore(clock.instant().plus(1, ChronoUnit.HOURS))) {
            throw new BadRequestException("Vui lòng đặt lịch trước giờ hẹn ít nhất 1 giờ.");
        }
        if (workingHours != null) {
            var hours = workingHours.get(salon.getId(), request.getScheduledAt().toLocalDate());
            var bookingEnd = request.getScheduledAt().plusMinutes(nailService.getDurationMinutes());
            if (hours.closed() || request.getScheduledAt().toLocalTime().isBefore(hours.openTime())
                    || !bookingEnd.toLocalDate().equals(request.getScheduledAt().toLocalDate())
                    || bookingEnd.toLocalTime().isAfter(hours.closeTime())) {
                throw new BadRequestException("Khung giờ nằm ngoài giờ hoạt động của salon.");
            }
        }

        Employee employee = null;
        if (request.getEmployeeId() != null) {
            employee = employeeRepository.findById(request.getEmployeeId())
                    .orElseThrow(() -> new ResourceNotFoundException("Employee", "id", request.getEmployeeId()));

            if (!employee.isActive() || !employee.getSalon().getId().equals(salon.getId())) {
                throw new BadRequestException("Employee does not belong to the specified salon");
            }
        }

        List<Booking> overlapping = bookingRepository.findOverlapping(salon.getId(), request.getScheduledAt(),
                request.getScheduledAt().plusMinutes(nailService.getDurationMinutes()));
        // Legacy bookings without an employee conservatively reserve the salon until resolved.
        if (overlapping.stream().anyMatch(existing -> existing.getEmployee() == null)) {
            throw new BadRequestException("Khung giờ này có lịch chưa được phân công nhân viên. Vui lòng chọn giờ khác.");
        }
        var busyEmployees = overlapping.stream().map(existing -> existing.getEmployee().getId())
                .collect(Collectors.toSet());
        if (employee == null) {
            List<Employee> candidates = employeeRepository.findBySalonIdAndActiveTrue(salon.getId());
            if (candidates.isEmpty()) {
                throw new BadRequestException("Salon chưa có nhân viên hoạt động để nhận lịch.");
            }
            employee = candidates.stream().filter(candidate -> !busyEmployees.contains(candidate.getId()))
                    .min(java.util.Comparator.comparing(Employee::getId))
                    .orElseThrow(() -> new BadRequestException("Không còn nhân viên trống trong khung giờ này. Vui lòng chọn giờ khác."));
        } else if (busyEmployees.contains(employee.getId())) {
            throw new BadRequestException("Nhân viên đã có lịch trong khung giờ này. Vui lòng chọn nhân viên hoặc giờ khác.");
        }

        Booking booking = Booking.builder()
                .customer(customer)
                .walkInName(walkInName)
                .customerPhone(customerPhone)
                .guestEmail(guestEmail)
                .salon(salon)
                .service(nailService)
                .employee(employee)
                .scheduledAt(request.getScheduledAt())
                .durationMinutes(nailService.getDurationMinutes())
                .servicePriceSnapshot(nailService.getPrice())
                .status(BookingStatus.PENDING)
                .customerNote(request.getCustomerNote())
                .build();

        booking = bookingRepository.save(booking);
        if (!booking.isWalkIn()) bookingEmails.enqueue(booking, false);
        if (guestEmail != null) bookingEmails.enqueueGuestReceipt(booking);
        return mapToBookingResponse(booking);
    }

    @Transactional
    public void cancelBooking(Long bookingId, UUID customerId) {
        Booking booking = bookingRepository.findForUpdateById(bookingId)
                .orElseThrow(() -> new ResourceNotFoundException("Booking", "id", bookingId));

        if (booking.getCustomer() == null || !booking.getCustomer().getId().equals(customerId)) {
            throw new UnauthorizedException("You can only cancel your own bookings");
        }

        if (booking.getStatus() == BookingStatus.COMPLETED ||
                booking.getStatus() == BookingStatus.CANCELLED) {
            throw new BadRequestException("Cannot cancel a booking that is already " + booking.getStatus());
        }

        booking.setStatus(BookingStatus.CANCELLED);
        booking.setCancellationReason("Cancelled by customer");
        bookingRepository.save(booking);
    }

    @Transactional(readOnly = true)
    public PageResponse<BookingResponse> getMyBookings(UUID customerId, Pageable pageable) {
        Page<Booking> bookingsPage =
                bookingRepository.findByCustomerIdOrderByCreatedAtDesc(customerId, pageable);

        List<BookingResponse> responses = bookingsPage.getContent().stream()
                .map(this::mapToBookingResponse)
                .collect(Collectors.toList());

        return PageResponse.of(responses, bookingsPage);
    }

    @Transactional(readOnly = true)
    public PageResponse<BookingResponse> getSalonBookings(Long salonId, BookingStatus status, Pageable pageable) {
        Page<Booking> bookingsPage;

        if (status != null) {
            bookingsPage =
                    bookingRepository.findBySalonIdAndStatusOrderByScheduledAtDesc(
                            salonId, status, pageable);
        } else {
            bookingsPage =
                    bookingRepository.findBySalonIdOrderByScheduledAtDesc(salonId, pageable);
        }

        List<BookingResponse> responses = bookingsPage.getContent().stream()
                .map(this::mapToBookingResponse)
                .collect(Collectors.toList());

        return PageResponse.of(responses, bookingsPage);
    }

    @Transactional
    public BookingResponse updateBookingStatus(
            Long bookingId, BookingStatusUpdateRequest request, UUID ownerId) {
        Booking booking = bookingRepository.findForUpdateById(bookingId)
                .orElseThrow(() -> new ResourceNotFoundException("Booking", "id", bookingId));

        if (!booking.getSalon().getOwner().getId().equals(ownerId)) {
            throw new UnauthorizedException("You are not the owner of this salon");
        }

        if (booking.getStatus() == request.getStatus()) return mapToBookingResponse(booking);
        boolean allowed = switch (booking.getStatus()) {
            case PENDING -> request.getStatus() == BookingStatus.CONFIRMED || request.getStatus() == BookingStatus.REJECTED || request.getStatus() == BookingStatus.CANCELLED;
            case CONFIRMED -> request.getStatus() == BookingStatus.IN_PROGRESS || request.getStatus() == BookingStatus.CANCELLED;
            case IN_PROGRESS -> request.getStatus() == BookingStatus.COMPLETED || request.getStatus() == BookingStatus.CANCELLED;
            default -> false;
        };
        if (!allowed) throw new BadRequestException("Invalid booking status transition");
        booking.setStatus(request.getStatus());
        if (request.getStatus() == BookingStatus.COMPLETED) {
            if (booking.getServicePriceSnapshot() == null) {
                booking.setServicePriceSnapshot(booking.getService().getPrice());
                booking.setRevenueEstimated(true);
            }
            booking.setCompletedAt(java.time.LocalDateTime.ofInstant(clock.instant(), ZoneId.of("Asia/Ho_Chi_Minh")));
            booking.setCompletionVersion(booking.getCompletionVersion() + 1);
            booking.setCompletionConfirmation(booking.getCustomer() == null ? CompletionConfirmation.CONFIRMED : CompletionConfirmation.PENDING);
            booking.setCompletionRespondedAt(null);
            booking.setCompletionCustomerNote(null);
            booking.setCompletionAdminNote(null);
            booking.setCompletionResolvedAt(null);
        }
        if (request.getSalonNote() != null) {
            booking.setSalonNote(request.getSalonNote());
        }

        if (request.getStatus() == BookingStatus.REJECTED || request.getStatus() == BookingStatus.CANCELLED) {
            booking.setCancellationReason(request.getSalonNote());
        }

        booking = bookingRepository.save(booking);
        if (booking.getStatus() == BookingStatus.CONFIRMED && !booking.isWalkIn()) bookingEmails.enqueue(booking, true);

        return mapToBookingResponse(booking);
    }

    BookingResponse mapToBookingResponse(Booking booking) {
        String phone = booking.getCustomerPhone();
        if ((phone == null || phone.isBlank()) && booking.getCustomer() != null) phone = booking.getCustomer().getPhone();
        return BookingResponse.builder()
                .id(booking.getId())
                .salonId(booking.getSalon().getId())
                .salonName(booking.getSalon().getName())
                .salonLogoUrl(booking.getSalon().getLogoUrl())
                .customerName(booking.contactName())
                .customerPhone(phone)
                .customerEmail(booking.contactEmail())
                .walkIn(booking.isWalkIn())
                .serviceId(booking.getService().getId())
                .serviceName(booking.getService().getName())
                .servicePrice(booking.getServicePriceSnapshot() != null ? booking.getServicePriceSnapshot() : booking.getService().getPrice())
                .employeeId(booking.getEmployee() != null ? booking.getEmployee().getId() : null)
                .employeeName(booking.getEmployee() != null ? booking.getEmployee().getFullName() : null)
                .scheduledAt(booking.getScheduledAt())
                .durationMinutes(booking.getDurationMinutes())
                .status(booking.getStatus())
                .reviewed(booking.getReview() != null)
                .reviewRating(booking.getReview() != null ? booking.getReview().getRating() : null)
                .customerNote(booking.getCustomerNote())
                .salonNote(booking.getSalonNote())
                .cancellationReason(booking.getCancellationReason())
                .createdAt(booking.getCreatedAt())
                .completionConfirmation(booking.effectiveCompletionConfirmation())
                .completionVersion(booking.getCompletionVersion())
                .completionRespondedAt(booking.getCompletionRespondedAt())
                .completionCustomerNote(booking.getCompletionCustomerNote())
                .completionAdminNote(booking.getCompletionAdminNote())
                .completionResolvedAt(booking.getCompletionResolvedAt())
                .build();
    }
}
