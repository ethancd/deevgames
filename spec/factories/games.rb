# Read about factories at https://github.com/thoughtbot/factory_girl

FactoryGirl.define do
  factory :game do
    p1_id 1
    p2_id 1
    phase "MyString"
  end
end