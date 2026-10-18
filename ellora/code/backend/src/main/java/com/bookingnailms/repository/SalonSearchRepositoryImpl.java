package com.bookingnailms.repository;

import com.bookingnailms.dto.salon.SalonSearchRequest;
import com.bookingnailms.dto.salon.SalonSummaryResponse;
import com.bookingnailms.entity.NailService;
import com.bookingnailms.entity.Salon;
import com.bookingnailms.entity.SalonClosure;
import com.bookingnailms.entity.SalonWorkingHour;
import com.bookingnailms.enums.SalonStatus;
import com.bookingnailms.enums.SubscriptionTier;
import jakarta.persistence.EntityManager;
import jakarta.persistence.criteria.*;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@RequiredArgsConstructor
public class SalonSearchRepositoryImpl implements SalonSearchRepository {
    private final EntityManager entityManager;

    @Override
    public Page<SalonSummaryResponse> searchPublic(SalonSearchRequest filters, LocalDateTime earliestBookable, LocalDateTime asOf, Pageable pageable) {
        var cb = entityManager.getCriteriaBuilder();
        var query = cb.createQuery(SalonSummaryResponse.class);
        var salon = query.from(Salon.class);
        var validPin = validPin(cb, salon);
        var distance = distance(cb, salon, filters);
        var effective = effectivePeriod(cb, salon, asOf);
        var effectiveTier = cb.<SubscriptionTier>selectCase().when(effective, salon.<SubscriptionTier>get("subscriptionTier"))
                .otherwise(cb.nullLiteral(SubscriptionTier.class));
        var badge = cb.<String>selectCase()
                .when(cb.and(effective,cb.equal(salon.get("subscriptionTier"),SubscriptionTier.VIP)),SubscriptionTier.VIP.badgeLabel())
                .when(cb.and(effective,cb.equal(salon.get("subscriptionTier"),SubscriptionTier.STANDARD)),SubscriptionTier.STANDARD.badgeLabel())
                .otherwise(cb.nullLiteral(String.class));
        query.select(cb.construct(SalonSummaryResponse.class,
                salon.get("id"), salon.get("name"), salon.get("address"), salon.get("city"),
                salon.get("logoUrl"), salon.get("averageRating"), salon.get("totalReviews"), salon.get("district"),
                cb.<Double>selectCase().when(validPin, salon.<Double>get("latitude")).otherwise(cb.nullLiteral(Double.class)),
                cb.<Double>selectCase().when(validPin, salon.<Double>get("longitude")).otherwise(cb.nullLiteral(Double.class)),
                distance, effectiveTier, badge));
        query.where(filters(cb, query, salon, filters, earliestBookable, distance));
        var order = new ArrayList<Order>();
        order.add(cb.desc(cb.<Integer>selectCase()
                .when(cb.and(effective,cb.equal(salon.get("subscriptionTier"),SubscriptionTier.VIP)),2)
                .when(cb.and(effective,cb.equal(salon.get("subscriptionTier"),SubscriptionTier.STANDARD)),1).otherwise(0)));
        order.addAll(switch (filters.sort()) {
            case "distance" -> List.of(cb.asc(distance), cb.desc(salon.get("id")));
            case "rating" -> List.of(cb.desc(cb.coalesce(salon.get("averageRating"), 0)),
                    cb.desc(cb.coalesce(salon.get("totalReviews"), 0)), cb.desc(salon.get("id")));
            default -> List.of(cb.desc(salon.get("id")));
        });
        query.orderBy(order);
        var content = entityManager.createQuery(query).setFirstResult(Math.toIntExact(pageable.getOffset()))
                .setMaxResults(pageable.getPageSize()).getResultList();

        var countQuery = cb.createQuery(Long.class);
        var countedSalon = countQuery.from(Salon.class);
        countQuery.select(cb.count(countedSalon));
        countQuery.where(filters(cb, countQuery, countedSalon, filters, earliestBookable, distance(cb, countedSalon, filters)));
        long total = entityManager.createQuery(countQuery).getSingleResult();
        return new PageImpl<>(content, pageable, total);
    }

    private Predicate[] filters(CriteriaBuilder cb, CriteriaQuery<?> query, Root<Salon> salon,
            SalonSearchRequest filters, LocalDateTime earliestBookable, Expression<Double> distance) {
        var conditions = new ArrayList<Predicate>();
        conditions.add(cb.equal(salon.get("status"), SalonStatus.ACTIVE));
        if (!filters.keyword().isEmpty()) {
            String keyword = pattern(filters.keyword());
            var serviceQuery = query.subquery(Integer.class);
            var service = serviceQuery.from(NailService.class);
            serviceQuery.select(cb.literal(1)).where(cb.equal(service.get("salon"), salon),
                    cb.isTrue(service.get("active")), matches(cb, service.get("name"), keyword));
            conditions.add(cb.or(matches(cb, salon.get("name"), keyword), matches(cb, salon.get("city"), keyword),
                    matches(cb, salon.get("district"), keyword), cb.exists(serviceQuery)));
        }
        if (!filters.location().isEmpty()) {
            String location = pattern(filters.location());
            conditions.add(cb.or(matches(cb, salon.get("address"), location), matches(cb, salon.get("district"), location),
                    matches(cb, salon.get("city"), location)));
        }
        if (filters.radiusKm() != null || "distance".equals(filters.sort())) conditions.add(validPin(cb, salon));
        if (filters.radiusKm() != null) conditions.add(cb.le(distance, filters.radiusKm()));
        if (filters.date() != null) openingFilters(cb, query, salon, filters, earliestBookable, conditions);
        return conditions.toArray(Predicate[]::new);
    }

    private void openingFilters(CriteriaBuilder cb, CriteriaQuery<?> query, Root<Salon> salon,
            SalonSearchRequest filters, LocalDateTime earliestBookable, List<Predicate> conditions) {
        var date = filters.date();
        if (filters.time() == null && date.isBefore(earliestBookable.toLocalDate())) {
            conditions.add(cb.disjunction());
            return;
        }
        var closureQuery = query.subquery(Integer.class);
        var closure = closureQuery.from(SalonClosure.class);
        closureQuery.select(cb.literal(1)).where(cb.equal(closure.get("salon"), salon), cb.equal(closure.get("date"), date));
        conditions.add(cb.not(cb.exists(closureQuery)));

        var savedQuery = query.subquery(Integer.class);
        var saved = savedQuery.from(SalonWorkingHour.class);
        savedQuery.select(cb.literal(1)).where(cb.equal(saved.get("salon"), salon),
                cb.equal(saved.get("dayOfWeek"), date.getDayOfWeek()));

        var openQuery = query.subquery(Integer.class);
        var hours = openQuery.from(SalonWorkingHour.class);
        var open = hours.<LocalTime>get("openTime");
        var close = hours.<LocalTime>get("closeTime");
        var openConditions = new ArrayList<>(List.of(cb.equal(hours.get("salon"), salon),
                cb.equal(hours.get("dayOfWeek"), date.getDayOfWeek()), cb.isFalse(hours.get("closed")),
                cb.isNotNull(open), cb.isNotNull(close), cb.lessThan(open, close)));
        boolean defaultOpen = date.getDayOfWeek() != DayOfWeek.SUNDAY;
        if (filters.time() != null) {
            openConditions.add(cb.lessThanOrEqualTo(open, filters.time()));
            openConditions.add(cb.greaterThan(close, filters.time()));
            defaultOpen &= !filters.time().isBefore(LocalTime.of(9, 0)) && filters.time().isBefore(LocalTime.of(18, 0));
        } else if (date.equals(earliestBookable.toLocalDate())) {
            openConditions.add(cb.greaterThan(close, earliestBookable.toLocalTime()));
            defaultOpen &= LocalTime.of(18, 0).isAfter(earliestBookable.toLocalTime());
        }
        openQuery.select(cb.literal(1)).where(openConditions.toArray(Predicate[]::new));
        conditions.add(cb.or(cb.exists(openQuery), defaultOpen ? cb.not(cb.exists(savedQuery)) : cb.disjunction()));
    }

    private Predicate validPin(CriteriaBuilder cb, Root<Salon> salon) {
        return cb.and(cb.between(salon.get("latitude"), -90.0, 90.0), cb.between(salon.get("longitude"), -180.0, 180.0));
    }

    private Predicate effectivePeriod(CriteriaBuilder cb, Root<Salon> salon, LocalDateTime asOf) {
        var starts = salon.<LocalDateTime>get("subscriptionStartsAt");
        var expires = salon.<LocalDateTime>get("subscriptionExpiresAt");
        return cb.and(cb.equal(salon.get("status"),SalonStatus.ACTIVE),
                salon.get("subscriptionTier").in(SubscriptionTier.STANDARD,SubscriptionTier.VIP),
                cb.lessThan(starts,expires),cb.lessThanOrEqualTo(starts,asOf),cb.greaterThan(expires,asOf));
    }

    private Expression<Double> distance(CriteriaBuilder cb, Root<Salon> salon, SalonSearchRequest filters) {
        if (filters.latitude() == null) return cb.nullLiteral(Double.class);
        var latitude = cb.function("radians", Double.class, salon.get("latitude"));
        var longitude = cb.function("radians", Double.class, salon.get("longitude"));
        double centerLatitude = Math.toRadians(filters.latitude());
        double centerLongitude = Math.toRadians(filters.longitude());
        var dot = cb.sum(cb.prod(cb.function("sin", Double.class, latitude), Math.sin(centerLatitude)),
                cb.prod(cb.prod(cb.function("cos", Double.class, latitude), Math.cos(centerLatitude)),
                        cb.function("cos", Double.class, cb.diff(longitude, centerLongitude))));
        // Clamp floating-point drift at identical/antipodal points before ACOS.
        var clamped = cb.function("least", Double.class, cb.literal(1.0),
                cb.function("greatest", Double.class, cb.literal(-1.0), dot));
        return cb.<Double>selectCase().when(validPin(cb, salon),
                cb.prod(cb.function("acos", Double.class, clamped), 6371.0088)).otherwise(cb.nullLiteral(Double.class));
    }

    private Predicate matches(CriteriaBuilder cb, Expression<String> text, String pattern) {
        return cb.like(cb.lower(cb.function("normalize", String.class, text)), pattern, '\\');
    }

    private String pattern(String value) {
        return "%" + java.text.Normalizer.normalize(value, java.text.Normalizer.Form.NFC).toLowerCase(Locale.ROOT)
                .replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%";
    }
}
